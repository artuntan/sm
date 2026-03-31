import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

/**
 * SM Infrastructure Stack
 *
 * Uses EXISTING resources:
 * - VPC: AtbilStack/AtbilVpc (vpc-0f586a54bb4aed12d)
 * - RDS: atbil-db (shared Postgres — we create a "smdb" database on it)
 *
 * Creates:
 * - EC2 t4g.micro with Docker + Caddy (auto-HTTPS via Let's Encrypt)
 * - ECR for Docker images
 * - SSM Parameter Store for secrets (free)
 *
 * Domain: marketing.type-of.com → EC2 public IP (A record in Namecheap)
 * HTTPS: Caddy handles TLS automatically, no CloudFront needed
 *
 * Cost (incremental — RDS already exists):
 *   EC2 t4g.micro:    $6.13/mo
 *   EBS 20GB gp3:     $1.60/mo
 *   ECR:              ~$0.10/mo
 *   ────────────────────────
 *   Total:            ~$7.83/mo
 *
 * Everything stays in eu-central-1.
 */

interface SmStackProps extends cdk.StackProps {
  stage: string;
}

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
    appSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "HTTP");
    appSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS");

    // Allow app server to reach the existing RDS
    existingDbSg.addIngressRule(appSg, ec2.Port.tcp(5432), "SM app → shared Postgres");

    // ── SSM Parameter Store (free) ───────────────────────────
    const paramPrefix = `/sm/${stage}`;

    const params: Record<string, { value: string; desc: string }> = {
      DATABASE_URL: {
        value: "CHANGE_AFTER_DEPLOY",
        desc: "postgresql://user:pass@atbil-db.cx4qim2qmdt8.eu-central-1.rds.amazonaws.com:5432/smdb",
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
      // System updates + Docker
      "yum update -y",
      "yum install -y docker jq",
      "systemctl enable docker && systemctl start docker",
      "usermod -aG docker ec2-user",

      // Install Caddy (reverse proxy with auto-HTTPS)
      "yum install -y yum-utils",
      "yum-config-manager --add-repo https://copr.fedorainfracloud.org/coprs/g/caddy/caddy/repo/epel-9/group_caddy-caddy-epel-9.repo || true",
      // Fallback: direct binary install
      "curl -fsSL 'https://caddyserver.com/api/download?os=linux&arch=arm64' -o /usr/bin/caddy && chmod +x /usr/bin/caddy",

      // Create Caddyfile for auto-HTTPS reverse proxy
      `cat > /etc/caddy/Caddyfile << 'CADDYEOF'
${appDomain} {
  reverse_proxy localhost:3000
}
CADDYEOF`,
      "mkdir -p /etc/caddy",
      `echo '${appDomain} { reverse_proxy localhost:3000 }' > /etc/caddy/Caddyfile`,

      // Caddy systemd service
      `cat > /etc/systemd/system/caddy.service << 'SVCEOF'
[Unit]
Description=Caddy web server
After=network.target

[Service]
ExecStart=/usr/bin/caddy run --config /etc/caddy/Caddyfile
ExecReload=/usr/bin/caddy reload --config /etc/caddy/Caddyfile
Restart=on-failure
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
SVCEOF`,
      "systemctl daemon-reload",
      "systemctl enable caddy",

      // ECR login
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

    // ── Outputs ──────────────────────────────────────────────
    new cdk.CfnOutput(this, "AppServerIp", {
      value: instance.instancePublicIp,
      description: "Point A record: marketing.type-of.com → this IP",
    });

    new cdk.CfnOutput(this, "EcrRepoUri", {
      value: repo.repositoryUri,
    });

    new cdk.CfnOutput(this, "SsmParamPrefix", {
      value: paramPrefix,
      description: "SSM parameter prefix — update secrets via: aws ssm put-parameter --name /sm/prod/KEY --value VALUE --overwrite",
    });

    new cdk.CfnOutput(this, "DnsInstructions", {
      value: `Add A record in Namecheap: marketing.type-of.com → ${instance.instancePublicIp}`,
    });
  }
}
