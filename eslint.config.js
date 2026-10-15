import js from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";
import react from "eslint-plugin-react";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  { 
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    plugins: { js, jsdoc }, 
    extends: ["js/recommended"], 
    languageOptions: {
      globals: globals.browser
    }, 
    rules: {
      "no-unused-vars": "warn",      // Warns about declared but unused variables
      "eqeqeq": "warn",             // Forces usage of === and !== instead of == and !=
      "semi": ["error", "always"],   // Throws an error if semicolons are missing
      "prefer-const": ["error", { "ignoreReadBeforeAssign": false }], // Enforces const, with extra parameters
      "jsdoc/require-jsdoc": [
        "error",
        {
          contexts: ["Program > VariableDeclaration"],
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: false,
            FunctionExpression: false,
          }
        }
      ],
      "jsdoc/require-description": [
        "error",
        {
          contexts: ["any"] 
        }
      ],
      "jsdoc/no-blank-blocks": "error",
      "jsdoc/require-param": "error",
      "jsdoc/require-param-description": "error",
      "jsdoc/check-param-names": "error",
      "jsdoc/require-returns": [
        "error",
        {
          "checkConstructors": false
        }
      ],
      "jsdoc/require-returns-description": "error",
      "jsdoc/require-returns-check": "error"
    }
  },

  ...tseslint.configs.recommended,

  {
    files: ["**/*.{ts,mts,cts,tsx}"],
    rules: {
      "@typescript-eslint/explicit-module-boundary-types": "error",
    }
  },

  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime']
]);
