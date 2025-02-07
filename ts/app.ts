#!/usr/bin/env node
import { config } from "dotenv";
config();

import * as dotenv from "dotenv";
import { softwareEngineering } from "./environments";
import { SEDevOpsResourcesStack } from "./devops/resources-stack";
import { SEIamPolicyStack } from "./devops/iam-stack";
import { SEPermissionSetStack } from "./devops/permission-sets-stack";

import * as cdk from "aws-cdk-lib";

const app = new cdk.App();

// Add environment validation
if (!process.env.SSO_INSTANCE_ARN) {
  throw new Error(
    "SSO_INSTANCE_ARN environment variable is not set. Please set this variable before running the CDK commands."
  );
}

// region ROOT ACCOUNT —— DEVOPS MANAGEMENT
const seDevopsResourcesStack = new SEDevOpsResourcesStack(
  app,
  "SEDevOpsResourcesStack",
  {
    env: softwareEngineering["ROOT"],
    description:
      "This stack contains important resources for DevOps management in SE.",
    terminationProtection: true,
  }
);

// Create the SSO Permission Sets in the ROOT account
const ssoStack = new SEPermissionSetStack(app, "SEPermissionSetStack", {
  env: softwareEngineering["ROOT"],
  description: "This stack contains SSO Permission Sets for SE accounts.",
  terminationProtection: true,
  ssoInstanceArn: process.env.SSO_INSTANCE_ARN as string,
});

// region IAM POLICIES
Object.entries(softwareEngineering).forEach(
  ([environmentName, environment]) => {
    // Skip creation of IAM Policies in the Root account
    if (environmentName.toUpperCase() === "ROOT") return;

    // Definition of the IAM Policy Stack
    const policyStack = new SEIamPolicyStack(
      app,
      `SEIam${environmentName}Stack`,
      {
        env: environment,
        description: `This stack contains IAM policies for the SE ${environmentName} account.`,
        terminationProtection: true,
        secretArn: seDevopsResourcesStack.seSecret.secretArn,
      }
    );

    if (process.env.JOB_ROLE === "DevOps") {
      // Create the permission sets after IAM Policies
      ssoStack.addDependency(policyStack);
    }
  }
);

// region NETWORKING
/**
 * Definition of the networking stack. This lives in the SE account.
 * This stack contains Certificate, DNS Records, API Gateways, and other resources.
 * TODO: Implement networking stacks
 */

app.synth();
