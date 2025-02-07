#!/usr/bin/env python3
import aws_cdk as cdk

# Hard-coded environments
software_engineering = {
    "ROOT" : cdk.Environment(account='654654598073', region='us-east-2'),
    "DEV": cdk.Environment(account='TBD', region='us-east-2'),
    "TESTING": cdk.Environment(account='TBD', region='us-east-2'),
    "PROD": cdk.Environment(account='TBD', region='us-east-2'),
}
