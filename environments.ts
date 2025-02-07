import * as cdk from "aws-cdk-lib";

export const softwareEngineering: { [key: string]: cdk.Environment } = {
  ROOT: {
    account: "481180369246",
    region: "us-east-2",
  },
  // DEV: {
  //   account: "TBD",
  //   region: "us-east-2",
  // },
  // TESTING: {
  //   account: "TBD",
  //   region: "us-east-2",
  // },
  // PROD: {
  //   account: "TBD",
  //   region: "us-east-2",
  // },
};
