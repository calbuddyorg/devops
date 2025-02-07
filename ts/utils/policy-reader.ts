import * as fs from "fs";
import * as path from "path";

/**
 * Reads an IAM policy from a JSON file and returns the object.
 *
 * @param filename - The name of the JSON file containing the IAM policy document
 * @returns The parsed JSON policy document
 * @throws {Error} If the file cannot be read or parsed
 */
export function policyReader(filename: string): any {
  const filePath = path.join("policy-definitions", filename);
  try {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(fileContent);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to read policy file ${filename}: ${error.message}`
      );
    }
    throw error;
  }
}
