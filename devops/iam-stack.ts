import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { policyReader } from "../utils/policy-reader";
import { softwareEngineering } from "../environments";

interface SEIamPolicyStackProps extends cdk.StackProps {
  secretArn: string;
}

export class SEIamPolicyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SEIamPolicyStackProps) {
    super(scope, id, props);

    /**
     * There is a maximum of 10 customer-managed policies per permission set
     * and a maximum of 10 AWS-managed policies per permission set.
     * and a maximum of 6,144 characters in a managed policy.
     * AWS doesn't count white spaces as part of the character limit.
     */

    const devopsPolicy = new iam.CfnManagedPolicy(this, "DevOpsFullAccess", {
      policyDocument: policyReader("SE_DevOps.json"),
      description:
        "This IAM policy provides full access to various AWS services " +
        "considered DevOps services, allowing all actions on these services " +
        "across all resources.",
      managedPolicyName: "SE_DevOpsFullAccess",
    });

    const dbPolicy = new iam.CfnManagedPolicy(this, "DBFullAccess", {
      policyDocument: policyReader("SE_DBFullAccess.json"),
      description:
        "This IAM policy grants full access to a range of AWS database " +
        "and storage services, including RDS, DynamoDB, Redshift, S3, and various " +
        "backup services. It allows all actions on these services across all resources.",
      managedPolicyName: "SE_DBFullAccess",
    });

    const devPolicy = new iam.CfnManagedPolicy(this, "DevFullAccess", {
      policyDocument: policyReader("SE_DevFullAccess.json"),
      description:
        "This IAM policy grants full access to a range of AWS services",
      managedPolicyName: "SE_DevFullAccess",
    });

    const denyIamRiskyPolicy = new iam.CfnManagedPolicy(
      this,
      "IAMRiskyActions",
      {
        policyDocument: policyReader("SE_DenyIAMRiskyActions.json"),
        description:
          "This IAM policy denies a range of potentially risky IAM actions, " +
          "such as creating users, changing passwords, and updating account details, " +
          "across all resources. Additionally, it specifically prevents editing of " +
          "policies starting with 'SE_' by the policy holder.",
        managedPolicyName: "SE_DenyIAMRiskyActions",
      }
    );

    // #region SE CUSTOM POLICY FOR EACH ORGANIZATION UNIT
    Object.entries(softwareEngineering).forEach(
      ([environmentName, environment]) => {
        // Skip ROOT account
        if (environmentName === "ROOT") return;

        // Conditionally create a custom policy for each environment
        if (this.account === environment.account) {
          const customPolicy = new iam.CfnManagedPolicy(
            this,
            `CUSTOM_${environmentName}`,
            {
              policyDocument: policyReader(`SE_CUSTOM_${environmentName}.json`),
              description: `Special and carefully designed policies for the SE ${environmentName} Organization Unit`,
              managedPolicyName: `SE_CUSTOM_${environmentName}`,
            }
          );
        }
      }
    );
    // #endregion

    // #region SNOWFLAKE SPECIAL PERMISSIONS
    const snowflakePolicy = new iam.CfnManagedPolicy(
      this,
      "SnowflakeStorageIntegrationPolicy",
      {
        policyDocument: policyReader("SE_SnowflakeStorageIntegration.json"),
        description:
          "Storage integration for S3 buckets located in our AWS Account. " +
          "This allows access to Snowflake. Be aware of the snowflake_external_id.",
        managedPolicyName: "SE_SnowflakeStorageIntegration",
      }
    );

    const seConfigSecret = secretsmanager.Secret.fromSecretPartialArn(
      this,
      "SEConfigSecret",
      props.secretArn
    );

    new cdk.CfnOutput(this, "SERootSecretArn", {
      value: props.secretArn,
      exportName: "SERootSecretArn",
    });

    const snowflakeExternalId = seConfigSecret
      .secretValueFromJson(`snowflake-external-id-${this.account}`)
      .unsafeUnwrap();

    const snowflakeRole = new iam.Role(
      this,
      "SnowflakeStorageIntegrationRole",
      {
        assumedBy: new iam.PrincipalWithConditions(
          new iam.ArnPrincipal(
            seConfigSecret
              .secretValueFromJson("snowflake-principal-arn")
              .unsafeUnwrap()
          ),
          {
            StringEquals: {
              "sts:ExternalId": snowflakeExternalId,
            },
          }
        ),
        roleName: "Snowflake_Storage_Integration_Role",
        managedPolicies: [
          iam.ManagedPolicy.fromManagedPolicyArn(
            this,
            "SnowflakeStorageIntegrationPolicyImport",
            snowflakePolicy.attrPolicyArn
          ),
        ],
      }
    );
    // #endregion
  }
}
