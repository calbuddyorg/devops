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

    // Grant child accounts
    Object.entries(softwareEngineering).forEach(
      ([environmentName, environment]) => {
        // Skip ROOT account
        if (environmentName === "ROOT") return;
        this.seSecret.grantRead(new iam.AccountPrincipal(environment.account));
      }
    );

    // #region GitHub Actions
    // Create the OIDC provider for GitHub Actions
    const githubOidcProvider = new iam.OpenIdConnectProvider(
      this,
      "GitHubOIDCProvider",
      {
        url: "https://token.actions.githubusercontent.com",
        clientIds: ["sts.amazonaws.com"],
      }
    );

    // Create a role for GitHub Actions
    const githubActionsRole = new iam.Role(this, "GitHubActionsRole", {
      roleName: "github-actions-role",
      assumedBy: new iam.WebIdentityPrincipal(
        githubOidcProvider.openIdConnectProviderArn,
        {
          /**
           * This is the pattern to match the GitHub Actions OIDC provider.
           * It matches pushes to the main branch in any repository in the organization.
           */
          StringLike: {
            // ORG_NAME is set in the GitHub Action workflow
            "token.actions.githubusercontent.com:sub": `repo:${process.env.GITHUB_ORG_NAME}/*:ref:refs/heads/main`,
          },
        }
      ),
    });

    // Add policy to assume CDK bootstrap roles
    githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["sts:AssumeRole"],
        resources: [
          `arn:aws:iam::${this.account}:role/cdk-hnb659fds-cfn-exec-role-${this.account}-${this.region}`,
          `arn:aws:iam::${this.account}:role/cdk-hnb659fds-deploy-role-${this.account}-${this.region}`,
          `arn:aws:iam::${this.account}:role/cdk-hnb659fds-file-publishing-role-${this.account}-${this.region}`,
          `arn:aws:iam::${this.account}:role/cdk-hnb659fds-image-publishing-role-${this.account}-${this.region}`,
          `arn:aws:iam::${this.account}:role/cdk-hnb659fds-lookup-role-${this.account}-${this.region}`,
        ],
      })
    );

    // #endregion
  }
}
