import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sso from "aws-cdk-lib/aws-sso";
import { Construct } from "constructs";

interface SEPermissionSetStackProps extends cdk.StackProps {
  ssoInstanceArn: string;
}

export class SEPermissionSetStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SEPermissionSetStackProps) {
    super(scope, id, props);

    // AWS-managed policies
    const readonlyPolicy =
      iam.ManagedPolicy.fromAwsManagedPolicyName("ReadOnlyAccess");
    const readbillingPolicy = iam.ManagedPolicy.fromAwsManagedPolicyName(
      "AWSBillingReadOnlyAccess"
    );

    // Create Permission Sets
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
