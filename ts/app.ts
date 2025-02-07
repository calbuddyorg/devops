#!/usr/bin/env node
import { config } from "dotenv";
config();

import { softwareEngineering } from "./environments";
import { SEDevOpsResourcesStack } from "./devops/resources-stack";
import { SEIamPolicyStack } from "./devops/iam-stack";
import { SEPermissionSetStack } from "./devops/permission-sets-stack";
// Optional, not needed at the moment.
import {
  SENetworkingStack,
  SERootNetworkingStack,
} from "./networking/networking-stack";

import * as cdk from "aws-cdk-lib";

const app = new cdk.App();

// #region ROOT ACCOUNT —— DEVOPS MANAGEMENT

/**
 * Definition of the resources needed to facilitate DevOps in SE accounts.
 * This lives in the SE account. This stack contains resources such as
 * a custom KMS key to encrypt/decrypt cross-account resources and a
 * secret to store general configurations.
 */
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

// #region IAM POLICIES
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

    // Create the permission sets after IAM Policies
    ssoStack.addDependency(policyStack);
  }
);

// #endregion

// #region NETWORKING
/**
 * Create the networking stacks for each environment except ROOT
 * These stacks contain resources like:
 * - Custom Domains
 * - DNS Records
 * - API Gateway (optional)
 * - Email Services (optional)
 */

// const rootNetworkingStack = new SERootNetworkingStack(
//   app,
//   "SERootNetworkingStack",
//   {
//     env: softwareEngineering["ROOT"],
//     description: "This stack contains root-level networking resources for SE.",
//     terminationProtection: true,
//     servicesDomain: process.env.SERVICES_DOMAIN as string,
//   }
// );

// Object.entries(softwareEngineering).forEach(
//   ([environmentName, environment]) => {
//     // Skip creation of Networking Stack in the Root account
//     if (environmentName.toUpperCase() === "ROOT") return;

//     // Create environment-specific networking stack
//     const networkingStack = new SENetworkingStack(
//       app,
//       `SENetworking${environmentName}Stack`,
//       {
//         env: environment,
//         description: `This stack contains networking resources for the SE ${environmentName} environment.`,
//         terminationProtection: true,
//         servicesDomain: process.env.SERVICES_DOMAIN as string,
//         createApiGateway: false,
//         createEmailService: false,
//       }
//     );

//     // Ensure networking stack depends on root networking stack
//     networkingStack.addDependency(rootNetworkingStack);
//   }
// );

// #endregion

app.synth();
