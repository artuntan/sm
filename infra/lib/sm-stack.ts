import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

/**
 * SM Infrastructure Stack
 *
 * Uses EXISTING resources:
 * - VPC: AtbilStack/AtbilVpc (vpc-0f586a54bb4aed12d) in eu-central-1
 * - RDS: atbil-db (shared Postgres — we create "smdb" database on it)
 * - ACM cert: pre-created in us-east-1 (required by CloudFront)
 *
 * Creates:
 * - EC2 t4g.micro with Docker (app server)
 * - CloudFront distribution → EC2 (HTTPS + global edge caching)
 * - ECR for Docker images
 * - SSM Parameter Store for secrets (free)
 *
 * Domain: marketing.type-of.com → CloudFront → EC2
 *
 * Cost (incremental):
 *   EC2 t4g.micro + EBS:  $7.73/mo
 *   CloudFront:           $0 (free tier: 1TB/10M requests)
 *   ECR:                  ~$0.10/mo
 *   ────────────────────────
 *   Total:                ~$7.83/mo
 */

interface SmStackProps extends cdk.StackProps {
  stage: string;
}

// Pre-created ACM certificate (us-east-1, covers *.type-of.com + type-of.com)
const CERT_ARN = "arn:aws:acm:us-east-1:334856751876:certificate/2b336fa5-c54c-4fff-a9a4-c066e6df00f8";

export class SmStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SmStackProps & cdk.StackProps) {
    super(scope, id, props);

    const { stage } = props;
    const isProd = stage === "production";
    const appDomain = "marketing.type-of.com";

    // ── Import existing VPC ──────────────────────────────────
    const vpc = ec2.Vpc.fromLookup(this, "ExistingVpc", {
      vpcId: "vpc-0f586a54bb4aed12d",
    });

    // ── Import existing RDS security group ───────────────────
    const existingDbSg = ec2.SecurityGroup.fromSecurityGroupId(
      this, "ExistingDbSg", "sg-028be2258c9d06dd1"
    );

    // ── Security Group for App Server ────────────────────────
    const appSg = new ec2.SecurityGroup(this, "AppSg", {
      vpc,
      description: "SM app server",
      allowAllOutbound: true,
    });
    // Only need port 80 — CloudFront terminates HTTPS
    appSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "HTTP from CloudFront");

    // Allow app server to reach the existing RDS
    existingDbSg.addIngressRule(appSg, ec2.Port.tcp(5432), "SM app to shared Postgres");

    // ── SSM Parameter Store (free) ───────────────────────────
    const paramPrefix = `/sm/${stage}`;

    const params: Record<string, { value: string; desc: string }> = {
      DATABASE_URL: {
        value: "CHANGE_AFTER_DEPLOY",
        desc: "postgresql://user:pass@atbil-db...rds.amazonaws.com:5432/smdb",
      },
      BETTER_AUTH_SECRET: {
        value: "CHANGE_AFTER_DEPLOY",
        desc: "Min 32 chars. Generate: openssl rand -base64 32",
      },
      BETTER_AUTH_URL: {
        value: `https://${appDomain}`,
        desc: "Public URL of the app",
      },
      BOOTSTRAP_ADMIN_EMAIL: { value: "admin@dimes.com", desc: "First admin email" },
      META_ACCESS_TOKEN: { value: "CHANGE_AFTER_DEPLOY", desc: "Meta Graph API token" },
      META_IG_USER_ID: { value: "CHANGE_AFTER_DEPLOY", desc: "Instagram business account ID" },
      APIFY_API_TOKEN: { value: "CHANGE_AFTER_DEPLOY", desc: "Apify API token" },
      YOUTUBE_API_KEY: { value: "CHANGE_AFTER_DEPLOY", desc: "YouTube Data API key" },
    };

    for (const [key, { value, desc }] of Object.entries(params)) {
      new ssm.StringParameter(this, `Param${key}`, {
        parameterName: `${paramPrefix}/${key}`,
        stringValue: value,
        description: desc,
      });
    }

    // ── ECR Repository ───────────────────────────────────────
    const repo = new ecr.Repository(this, "AppRepo", {
      repositoryName: `sm-app-${stage}`,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: !isProd,
      lifecycleRules: [{ maxImageCount: 5, description: "Keep last 5 images" }],
    });

    // ── EC2 Instance ─────────────────────────────────────────
    const role = new iam.Role(this, "AppRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
      ],
    });
    repo.grantPull(role);
    role.addToPolicy(new iam.PolicyStatement({
      actions: ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"],
      resources: [`arn:aws:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter${paramPrefix}/*`],
    }));

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "yum update -y",
      "yum install -y docker jq",
      "systemctl enable docker && systemctl start docker",
      "usermod -aG docker ec2-user",
      `aws ecr get-login-password --region ${cdk.Aws.REGION} | docker login --username AWS --password-stdin ${cdk.Aws.ACCOUNT_ID}.dkr.ecr.${cdk.Aws.REGION}.amazonaws.com`,
      "echo 'EC2 ready for SM deployment' > /home/ec2-user/ready.txt"
    );

    const instance = new ec2.Instance(this, "AppServer", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      }),
      securityGroup: appSg,
      role,
      userData,
      blockDevices: [{
        deviceName: "/dev/xvda",
        volume: ec2.BlockDeviceVolume.ebs(20, { volumeType: ec2.EbsDeviceVolumeType.GP3 }),
      }],
    });

    // ── CloudFront ───────────────────────────────────────────
    // Import pre-created ACM certificate from us-east-1
    const certificate = acm.Certificate.fromCertificateArn(
      this, "AppCert", CERT_ARN
    );

    const distribution = new cloudfront.Distribution(this, "AppCdn", {
      defaultBehavior: {
        origin: new origins.HttpOrigin(instance.instancePublicDnsName, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          httpPort: 80,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        // Cache static assets, bypass cache for API/auth
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
      },
      // API routes and auth — no caching
      additionalBehaviors: {
        "/api/*": {
          origin: new origins.HttpOrigin(instance.instancePublicDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
      },
      domainNames: [appDomain],
      certificate,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
    });

    // ── Outputs ──────────────────────────────────────────────
    new cdk.CfnOutput(this, "CloudFrontDomain", {
      value: distribution.distributionDomainName,
      description: "CNAME marketing.type-of.com → this value",
    });

    new cdk.CfnOutput(this, "CloudFrontId", {
      value: distribution.distributionId,
    });

    new cdk.CfnOutput(this, "AppServerIp", {
      value: instance.instancePublicIp,
      description: "EC2 direct IP (for debugging)",
    });

    new cdk.CfnOutput(this, "EcrRepoUri", {
      value: repo.repositoryUri,
    });

    new cdk.CfnOutput(this, "SsmParamPrefix", {
      value: paramPrefix,
      description: "Update secrets: aws ssm put-parameter --name /sm/prod/KEY --value VALUE --overwrite",
    });
  }
}
