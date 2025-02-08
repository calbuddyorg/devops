import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sso from "aws-cdk-lib/aws-sso";
import { Construct } from "constructs";

/**
 * This stack lives in the ROOT account and needs to be hard-coded.
 * Permission-sets need to be carefully examined.
 * Leverage the already defined customer-managed policies.
 *
 * Permission Sets cannot be assigned / provisioned via code.
 * They must be manually provisioned in the SSO Management Console.
 * The ADMIN in the ROOT account is who decides whether to provision a permission set or propose changes.
 *
 * The goal behind this implementation is to update/mantain already provisioned permission sets.
 * AWS automatically re-provisions the permission set upon changes.
 */

interface SEPermissionSetStackProps extends cdk.StackProps {
  ssoInstanceArn: string;
}

export class SEPermissionSetStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SEPermissionSetStackProps) {
    super(scope, id, props);

    /**
     * There is a maximum of 10 customer-managed policies per permission set
     * and a maximum of 10 AWS-managed policies per permission set.
     * and a maximum of 6,144 characters in a managed policy.
     * AWS doesn't count white spaces as part of the character limit.
     */

    /**
     * AWS-managed policies.
     */
    const readonlyPolicy =
      iam.ManagedPolicy.fromAwsManagedPolicyName("ReadOnlyAccess");
    const readbillingPolicy = iam.ManagedPolicy.fromAwsManagedPolicyName(
      "AWSBillingReadOnlyAccess"
    );

    // Create Permission Sets
    const seDevPermissionSet = new sso.CfnPermissionSet(
      this,
      "DEV_PERMISSION_SET",
      {
        name: "SE_DEV",
        description:
          "Grants full-access to core AWS services. Intended for SE DEV OU ONLY.",
        instanceArn: props.ssoInstanceArn,
        customerManagedPolicyReferences: [
          { name: "SE_DevOpsFullAccess" },
          { name: "SE_DBFullAccess" },
          { name: "SE_DevFullAccess" },
          { name: "SE_DenyIAMRiskyActions" },
          { name: "SE_CUSTOM_DEV" },
        ],
        managedPolicies: [
          readonlyPolicy.managedPolicyArn,
          readbillingPolicy.managedPolicyArn,
        ],
        sessionDuration: "PT8H",
      }
    );

    const seTestingPermissionSet = new sso.CfnPermissionSet(
      this,
      "TESTING_PERMISSION_SET",
      {
        name: "SE_TESTING",
        description:
          "Allows read-only and basic/limited access to the SE TESTING OU.",
        instanceArn: props.ssoInstanceArn,
        customerManagedPolicyReferences: [
          { name: "SE_DenyIAMRiskyActions" },
          { name: "SE_CUSTOM_TESTING" },
        ],
        managedPolicies: [
          readonlyPolicy.managedPolicyArn,
          readbillingPolicy.managedPolicyArn,
        ],
        sessionDuration: "PT8H",
      }
    );

    const seProdPermissionSet = new sso.CfnPermissionSet(
      this,
      "PROD_PERMISSION_SET",
      {
        name: "SE_PROD",
        description:
          "Allows read-only and basic/limited access to the SE PRODUCTION OU.",
        instanceArn: props.ssoInstanceArn,
        customerManagedPolicyReferences: [
          { name: "SE_DenyIAMRiskyActions" },
          { name: "SE_CUSTOM_PROD" },
        ],
        managedPolicies: [
          readonlyPolicy.managedPolicyArn,
          readbillingPolicy.managedPolicyArn,
        ],
        sessionDuration: "PT8H",
      }
    );

    const seRootPermissionSet = new sso.CfnPermissionSet(
      this,
      "ROOT_PERMISSION_SET",
      {
        name: "SE_ROOT",
        description:
          "Allows read-only and basic/limited access to the ROOT OU.",
        instanceArn: props.ssoInstanceArn,
        customerManagedPolicyReferences: [
          { name: "SE_DenyIAMRiskyActions" },
          { name: "SE_CUSTOM_ROOT" },
        ],
        managedPolicies: [
          readonlyPolicy.managedPolicyArn,
          readbillingPolicy.managedPolicyArn,
        ],
        sessionDuration: "PT8H",
      }
    );

    const seDevOps = new sso.CfnPermissionSet(
      this,
      "SE_DEVOPS_PERMISSION_SET",
      {
        name: "SE_DEVOPS",
        description:
          "Grants full-access to core CI/CD services. Intended for a DevOps person.",
        instanceArn: props.ssoInstanceArn,
        customerManagedPolicyReferences: [{ name: "SE_DevOpsFullAccess" }],
        managedPolicies: [
          readonlyPolicy.managedPolicyArn,
          readbillingPolicy.managedPolicyArn,
        ],
        sessionDuration: "PT8H",
      }
    );
  }
}
