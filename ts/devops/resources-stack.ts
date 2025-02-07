import * as cdk from "aws-cdk-lib";
import * as kms from "aws-cdk-lib/aws-kms";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { softwareEngineering } from "../environments";

export class SEDevOpsResourcesStack extends cdk.Stack {
  public readonly kmsKey: kms.Key;
  public readonly seSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a KMS key for the secret
    this.kmsKey = new kms.Key(this, "SERootKMSKey", {
      alias: "SE_Root_KMS_Key",
      description:
        "This KMS key is used to encrypt SE resources that need customer-managed keys.",
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Grant access to child accounts
    Object.entries(softwareEngineering).forEach(
      ([environmentName, environment]) => {
        // Skip ROOT account
        if (environmentName === "ROOT") return;

        this.kmsKey.grant(
          new iam.AccountPrincipal(environment.account),
          "kms:CreateGrant",
          "kms:Decrypt",
          "kms:DescribeKey",
          "kms:Encrypt",
          "kms:GenerateDataKey*",
          "kms:ReEncrypt*"
        );
      }
    );

    // Create a secret in the SE_ROOT account for IAM Configs
    this.seSecret = new secretsmanager.Secret(this, "SEConfigs", {
      description: "This secret stores general configurations for SE projects.",
      secretName: "SE_Configuration",
      encryptionKey: this.kmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      secretObjectValue: {
        "se-root-kms-key-arn": cdk.SecretValue.unsafePlainText(
          this.kmsKey.keyArn
        ),
      },
    });
  }
}
