import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

/**
 * SM Infrastructure Stack
 *
 * Architecture (optimized for cost — ~$22/month):
 *
 *   [CloudFront] → [EC2 t4g.micro + Docker] → [RDS Postgres t4g.micro]
 *       $0              $7.73/mo                    $14.71/mo
 *
 * - EC2 in public subnet (no ALB needed — saves $16/mo)
 * - RDS in private subnet (no public access)
 * - No NAT Gateway (saves $32/mo — EC2 is in public subnet)
 * - ECR for Docker images
 * - Secrets Manager for credentials
 *
 * Cost breakdown (eu-west-1):
 *   EC2 t4g.micro:    $6.13/mo (free tier eligible first 12 months)
 *   EBS 20GB gp3:     $1.60/mo
 *   RDS t4g.micro:    $12.41/mo
 *   RDS 20GB gp3:     $2.30/mo
 *   ECR:              ~$0.10/mo
 *   Secrets Manager:  $0.80/mo (2 secrets × $0.40)
 *   ─────────────────────────
 *   Total:            $23.34/mo ($15.61 with EC2 free tier)
 */

interface SmStackProps extends cdk.StackProps {
  stage: string;
}

export class SmStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SmStackProps & cdk.StackProps) {
    super(scope, id, props);

    const { stage } = props;
    const isProd = stage === "production";

    // ── VPC ──────────────────────────────────────────────────
    // 2 AZs, public + private subnets, NO NAT Gateway
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0, // Saves $32/mo
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // ── Security Groups ──────────────────────────────────────
    const appSg = new ec2.SecurityGroup(this, "AppSg", {
      vpc,
      description: "SM app server",
      allowAllOutbound: true,
    });
    appSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "HTTP");
    appSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS");
    appSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), "SSH");

    const dbSg = new ec2.SecurityGroup(this, "DbSg", {
      vpc,
      description: "SM database",
      allowAllOutbound: false,
    });
    dbSg.addIngressRule(appSg, ec2.Port.tcp(5432), "Postgres from app");

    // ── Database ─────────────────────────────────────────────
    const dbCredentials = new secretsmanager.Secret(this, "DbCredentials", {
      secretName: `sm/${stage}/db-credentials`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "smadmin" }),
        generateStringKey: "password",
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    const database = new rds.DatabaseInstance(this, "Database", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      credentials: rds.Credentials.fromSecret(dbCredentials),
      databaseName: "smdb",
      allocatedStorage: 20,
      storageType: rds.StorageType.GP3,
      multiAz: false, // Single AZ — saves ~$12/mo
      backupRetention: cdk.Duration.days(isProd ? 7 : 1),
      deletionProtection: isProd,
      removalPolicy: isProd
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // ── App Secrets ──────────────────────────────────────────
    const appSecrets = new secretsmanager.Secret(this, "AppSecrets", {
      secretName: `sm/${stage}/app-secrets`,
      secretObjectValue: {
        BETTER_AUTH_SECRET: cdk.SecretValue.unsafePlainText(
          "CHANGE_ME_AFTER_DEPLOY_" + Math.random().toString(36).slice(2)
        ),
        META_ACCESS_TOKEN: cdk.SecretValue.unsafePlainText(""),
        META_IG_USER_ID: cdk.SecretValue.unsafePlainText(""),
        APIFY_API_TOKEN: cdk.SecretValue.unsafePlainText(""),
        YOUTUBE_API_KEY: cdk.SecretValue.unsafePlainText(""),
        BOOTSTRAP_ADMIN_EMAIL: cdk.SecretValue.unsafePlainText("admin@dimes.com"),
      },
    });

    // ── ECR Repository ───────────────────────────────────────
    const repo = new ecr.Repository(this, "AppRepo", {
      repositoryName: `sm-app-${stage}`,
      removalPolicy: isProd
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: !isProd,
      lifecycleRules: [
        {
          maxImageCount: 5,
          description: "Keep last 5 images",
        },
      ],
    });

    // ── EC2 Instance ─────────────────────────────────────────
    const role = new iam.Role(this, "AppRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
      ],
    });
    repo.grantPull(role);
    dbCredentials.grantRead(role);
    appSecrets.grantRead(role);

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      // Install Docker
      "yum update -y",
      "yum install -y docker jq",
      "systemctl enable docker && systemctl start docker",
      "usermod -aG docker ec2-user",

      // Install AWS CLI v2 (already on AL2023)
      // Login to ECR
      `aws ecr get-login-password --region ${cdk.Aws.REGION} | docker login --username AWS --password-stdin ${cdk.Aws.ACCOUNT_ID}.dkr.ecr.${cdk.Aws.REGION}.amazonaws.com`,

      // Pull and run the app (deploy script will handle actual image tag)
      "echo 'EC2 ready for SM deployment' > /home/ec2-user/ready.txt"
    );

    const instance = new ec2.Instance(this, "AppServer", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      }),
      securityGroup: appSg,
      role,
      userData,
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(20, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ],
    });

    // ── Outputs ──────────────────────────────────────────────
    new cdk.CfnOutput(this, "AppServerIp", {
      value: instance.instancePublicIp,
      description: "EC2 public IP — point your domain here",
    });

    new cdk.CfnOutput(this, "DatabaseEndpoint", {
      value: database.instanceEndpoint.hostname,
      description: "RDS endpoint (private, accessible from EC2 only)",
    });

    new cdk.CfnOutput(this, "EcrRepoUri", {
      value: repo.repositoryUri,
      description: "ECR repository URI for docker push",
    });

    new cdk.CfnOutput(this, "DbCredentialsArn", {
      value: dbCredentials.secretArn,
      description: "DB credentials in Secrets Manager",
    });

    new cdk.CfnOutput(this, "AppSecretsArn", {
      value: appSecrets.secretArn,
      description: "App secrets in Secrets Manager",
    });
  }
}
