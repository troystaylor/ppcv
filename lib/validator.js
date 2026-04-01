const fs = require("fs");
const path = require("path");

/**
 * Validate apiDefinition.swagger.json
 */
function validateSwagger(swaggerPath) {
  const errors = [];
  const warnings = [];
  let operationIds = [];

  let swagger;
  try {
    swagger = JSON.parse(fs.readFileSync(swaggerPath, "utf8"));
  } catch (e) {
    return { valid: false, errors: [`Invalid JSON: ${e.message}`], warnings: [], operationIds: [] };
  }

  // Required top-level fields
  for (const field of ["swagger", "info", "paths"]) {
    if (!(field in swagger)) errors.push(`Missing required field: '${field}'`);
  }

  // Swagger version
  if (swagger.swagger && swagger.swagger !== "2.0") {
    errors.push(`Invalid swagger version: '${swagger.swagger}' (must be '2.0')`);
  }

  // Info
  if (swagger.info) {
    if (!swagger.info.title) errors.push("Missing required field: 'info.title'");
    if (!swagger.info.version) errors.push("Missing required field: 'info.version'");
  }

  // Host
  if (swagger.host && /[{}/ \\]/.test(swagger.host)) {
    errors.push(`Invalid host: '${swagger.host}' — must not contain {, }, /, spaces, or backslashes`);
  }

  // BasePath
  if (swagger.basePath && !swagger.basePath.startsWith("/")) {
    errors.push(`Invalid basePath: '${swagger.basePath}' — must start with '/'`);
  }

  // Paths
  const httpMethods = ["get", "put", "post", "delete", "options", "head", "patch"];

  if (swagger.paths) {
    for (const [pathKey, pathItem] of Object.entries(swagger.paths)) {
      if (!pathKey.startsWith("/") && !pathKey.startsWith("x-")) {
        errors.push(`Path '${pathKey}' must start with '/'`);
      }
      if (!pathItem || typeof pathItem !== "object") continue;

      for (const [method, operation] of Object.entries(pathItem)) {
        if (method === "parameters" || method.startsWith("x-")) continue;
        if (!httpMethods.includes(method)) {
          warnings.push(`Unknown HTTP method '${method}' on path '${pathKey}'`);
          continue;
        }
        if (!operation || typeof operation !== "object") continue;

        // operationId
        if (operation.operationId) {
          if (operationIds.includes(operation.operationId)) {
            errors.push(`Duplicate operationId: '${operation.operationId}' on ${method.toUpperCase()} ${pathKey}`);
          }
          operationIds.push(operation.operationId);
        } else {
          warnings.push(`Missing operationId on ${method.toUpperCase()} ${pathKey}`);
        }

        // responses
        if (!operation.responses) {
          errors.push(`Missing 'responses' on ${method.toUpperCase()} ${pathKey} (operationId: ${operation.operationId})`);
        }

        // Parameters
        if (Array.isArray(operation.parameters)) {
          for (const param of operation.parameters) {
            if (!param.name) errors.push(`Parameter missing 'name' on ${method.toUpperCase()} ${pathKey}`);
            if (!param.in) errors.push(`Parameter '${param.name}' missing 'in' on ${method.toUpperCase()} ${pathKey}`);

            if (param.in === "path" && param.required !== true) {
              errors.push(`Path parameter '${param.name}' must have required=true on ${method.toUpperCase()} ${pathKey}`);
            }
            if (param.in === "path" && !param["x-ms-url-encoding"]) {
              warnings.push(`Path parameter '${param.name}' missing x-ms-url-encoding on ${method.toUpperCase()} ${pathKey}`);
            }
            if (param.in === "body" && !param.schema) {
              errors.push(`Body parameter '${param.name}' missing 'schema' on ${method.toUpperCase()} ${pathKey}`);
            }
            if (param.in && param.in !== "body" && !param.type) {
              errors.push(`Parameter '${param.name}' missing 'type' on ${method.toUpperCase()} ${pathKey}`);
            }
          }
        }
      }
    }
  }

  // Array items check (recursive)
  checkArrayItems(swagger, "#", errors);

  // Security definitions
  if (swagger.securityDefinitions) {
    for (const [name, def] of Object.entries(swagger.securityDefinitions)) {
      if (!def.type) errors.push(`Security definition '${name}' missing 'type'`);
    }
  }

  // x-ms-connector-metadata
  if (!swagger["x-ms-connector-metadata"]) {
    warnings.push("Missing x-ms-connector-metadata");
  }

  return { valid: errors.length === 0, errors, warnings, operationIds };
}

/**
 * Recursively check that all type:array schemas have items
 */
function checkArrayItems(obj, jsonPath, errors) {
  if (obj === null || obj === undefined || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => checkArrayItems(item, `${jsonPath}[${i}]`, errors));
    return;
  }
  if (obj.type === "array" && !obj.items) {
    errors.push(`Array schema at '${jsonPath}' missing 'items'`);
  }
  for (const [key, value] of Object.entries(obj)) {
    checkArrayItems(value, `${jsonPath}/${key}`, errors);
  }
}

/**
 * Validate apiProperties.json
 */
function validateApiProperties(propsPath, swaggerOperationIds) {
  const errors = [];
  const warnings = [];

  let props;
  try {
    props = JSON.parse(fs.readFileSync(propsPath, "utf8"));
  } catch (e) {
    return { valid: false, errors: [`Invalid JSON: ${e.message}`], warnings: [] };
  }

  if (!props.properties) {
    errors.push("Missing required field: 'properties'");
    return { valid: false, errors, warnings };
  }

  const p = props.properties;

  // iconBrandColor
  if (!p.iconBrandColor) {
    errors.push("Missing required field: 'properties.iconBrandColor'");
  } else if (!/^#[0-9a-fA-F]{6}$/.test(p.iconBrandColor)) {
    warnings.push(`iconBrandColor '${p.iconBrandColor}' may not be a valid hex color`);
  }

  // publisher
  if (!p.publisher) warnings.push("Missing 'properties.publisher'");

  // connectionParameters
  if (p.connectionParameters) {
    for (const [name, cp] of Object.entries(p.connectionParameters)) {
      if (!cp.type) errors.push(`Connection parameter '${name}' missing 'type'`);
      if (cp.type === "oauthSetting" && cp.oAuthSettings) {
        if (!cp.oAuthSettings.identityProvider) {
          errors.push(`OAuth setting '${name}' missing 'identityProvider'`);
        }
        const valid = ["oauth2", "oauth2generic", "aad", "aadcertificate", "facebook"];
        if (cp.oAuthSettings.identityProvider && !valid.includes(cp.oAuthSettings.identityProvider)) {
          errors.push(`OAuth setting '${name}' has invalid identityProvider: '${cp.oAuthSettings.identityProvider}'`);
        }
      }
    }
  } else {
    warnings.push("No connectionParameters defined");
  }

  // scriptOperations cross-check
  if (Array.isArray(p.scriptOperations) && swaggerOperationIds.length > 0) {
    const scriptOps = p.scriptOperations;
    for (const op of scriptOps) {
      if (!swaggerOperationIds.includes(op)) {
        errors.push(`scriptOperations lists '${op}' but no matching operationId found in swagger`);
      }
    }
    for (const op of swaggerOperationIds) {
      if (!scriptOps.includes(op)) {
        warnings.push(`operationId '${op}' in swagger but not listed in scriptOperations`);
      }
    }
  }

  // capabilities
  if (Array.isArray(p.capabilities)) {
    for (const cap of p.capabilities) {
      if (!["actions", "triggers"].includes(cap)) {
        warnings.push(`Unknown capability: '${cap}'`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate script.csx per MS Learn:
 * https://learn.microsoft.com/connectors/custom-connectors/write-code
 */
const SUPPORTED_NAMESPACES = new Set([
  "System",
  "System.Collections",
  "System.Collections.Generic",
  "System.Diagnostics",
  "System.IO",
  "System.IO.Compression",
  "System.Linq",
  "System.Net",
  "System.Net.Http",
  "System.Net.Http.Headers",
  "System.Net.Security",
  "System.Security.Authentication",
  "System.Security.Cryptography",
  "System.Text",
  "System.Text.RegularExpressions",
  "System.Threading",
  "System.Threading.Tasks",
  "System.Web",
  "System.Xml",
  "System.Xml.Linq",
  "System.Drawing",
  "System.Drawing.Drawing2D",
  "System.Drawing.Imaging",
  "Microsoft.Extensions.Logging",
  "Newtonsoft.Json",
  "Newtonsoft.Json.Linq",
]);

function validateScript(scriptPath) {
  const errors = [];
  const warnings = [];

  let content;
  try {
    content = fs.readFileSync(scriptPath, "utf8");
  } catch (e) {
    return { valid: false, errors: [`Cannot read file: ${e.message}`], warnings: [] };
  }

  // File size: must not exceed 1 MB
  const stats = fs.statSync(scriptPath);
  if (stats.size > 1_048_576) {
    errors.push(`Script file exceeds 1 MB limit (${(stats.size / 1_048_576).toFixed(2)} MB)`);
  }

  // Class must be named Script and extend ScriptBase
  if (!/class\s+Script\s*:\s*ScriptBase/.test(content)) {
    errors.push("Class must be named 'Script' and extend 'ScriptBase'");
  }

  // Must implement ExecuteAsync
  if (!/ExecuteAsync\s*\(/.test(content)) {
    errors.push("Must implement 'ExecuteAsync' method");
  }

  // Check for unsupported namespaces
  const usingRegex = /^\s*using\s+([\w.]+)\s*;/gm;
  let match;
  while ((match = usingRegex.exec(content)) !== null) {
    const ns = match[1];
    if (!SUPPORTED_NAMESPACES.has(ns)) {
      errors.push(`Unsupported namespace: '${ns}' — see https://learn.microsoft.com/connectors/custom-connectors/write-code#supported-namespaces`);
    }
  }

  // No new HttpClient() — MS Learn: "we'll block this in the future"
  if (/new\s+HttpClient\s*\(/.test(content)) {
    warnings.push("Avoid 'new HttpClient()' — use 'this.Context.SendAsync' instead (will be blocked in future)");
  }

  // Ambiguous Formatting reference — must use Newtonsoft.Json.Formatting
  const bareFormatting = /(?<!Newtonsoft\.Json\.)Formatting\.(None|Indented)/g;
  let fmtMatch;
  while ((fmtMatch = bareFormatting.exec(content)) !== null) {
    // Check it's not already fully qualified by looking behind further
    const before = content.substring(Math.max(0, fmtMatch.index - 30), fmtMatch.index);
    if (!before.includes("Newtonsoft.Json.")) {
      warnings.push(`Use 'Newtonsoft.Json.Formatting.${fmtMatch[1]}' instead of bare 'Formatting.${fmtMatch[1]}' to avoid ambiguous reference errors`);
    }
  }

  // Balanced braces check (catches truncated files)
  let braceDepth = 0;
  for (const ch of content) {
    if (ch === "{") braceDepth++;
    else if (ch === "}") braceDepth--;
  }
  if (braceDepth !== 0) {
    errors.push(`Unbalanced braces (depth: ${braceDepth}) — file may be truncated or have syntax errors`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a connector directory
 */
function validateConnector(connectorDir) {
  const swaggerPath = path.join(connectorDir, "apiDefinition.swagger.json");
  const propsPath = path.join(connectorDir, "apiProperties.json");
  const scriptPath = path.join(connectorDir, "script.csx");

  if (!fs.existsSync(swaggerPath)) {
    return {
      connector: path.basename(connectorDir),
      path: connectorDir,
      valid: false,
      operations: 0,
      errors: [`apiDefinition.swagger.json not found in ${connectorDir}`],
      warnings: [],
      files: {},
    };
  }

  const swaggerResult = validateSwagger(swaggerPath);
  const files = {
    "apiDefinition.swagger.json": {
      valid: swaggerResult.valid,
      errors: swaggerResult.errors,
      warnings: swaggerResult.warnings,
    },
  };

  let propsResult = null;
  if (fs.existsSync(propsPath)) {
    propsResult = validateApiProperties(propsPath, swaggerResult.operationIds);
    files["apiProperties.json"] = {
      valid: propsResult.valid,
      errors: propsResult.errors,
      warnings: propsResult.warnings,
    };
  }

  let scriptResult = null;
  if (fs.existsSync(scriptPath)) {
    scriptResult = validateScript(scriptPath);
    files["script.csx"] = {
      valid: scriptResult.valid,
      errors: scriptResult.errors,
      warnings: scriptResult.warnings,
    };
  }

  const allErrors = [
    ...swaggerResult.errors,
    ...(propsResult ? propsResult.errors : []),
    ...(scriptResult ? scriptResult.errors : []),
  ];
  const allWarnings = [
    ...swaggerResult.warnings,
    ...(propsResult ? propsResult.warnings : []),
    ...(scriptResult ? scriptResult.warnings : []),
  ];

  return {
    connector: path.basename(connectorDir),
    path: connectorDir,
    valid: allErrors.length === 0,
    operations: swaggerResult.operationIds.length,
    errors: allErrors,
    warnings: allWarnings,
    files,
  };
}

module.exports = { validateSwagger, validateApiProperties, validateScript, validateConnector };
