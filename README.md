# ppcv

Power Platform Connector Validator. Checks `apiDefinition.swagger.json`, `apiProperties.json`, and `script.csx` against official Microsoft schemas and documented requirements.

## Install

```bash
npm install -g ppcv
```

Or run without installing:

```bash
npx ppcv ./MyConnector
```

## Usage

```
ppcv [path] [options]

Arguments:
  path          Path to a connector folder or apiDefinition.swagger.json
                (defaults to current directory)

Options:
  --json, -j    Output results as JSON (for CI/CD pipelines)
  --help, -h    Show help
  --version, -v Show version
```

## Examples

```bash
# Validate a connector folder
ppcv ./MyConnector

# JSON output for CI/CD
ppcv ./MyConnector --json

# Validate current directory
ppcv

# Pipe JSON to jq
ppcv ./MyConnector -j | jq '.errors'

# Batch validate all connectors
for dir in */; do
  if [ -f "$dir/apiDefinition.swagger.json" ]; then
    ppcv "$dir" --json
  fi
done
```

## What It Checks

### apiDefinition.swagger.json
- Required fields (`swagger`, `info`, `paths`)
- Swagger 2.0 version
- Host and basePath format
- Unique operationIds
- Response definitions on every operation
- Parameter completeness (name, in, type, required)
- Path parameters have `x-ms-url-encoding`
- Array schemas include `items`
- Security definitions have `type`
- `x-ms-connector-metadata` presence

### apiProperties.json
- Required `properties.iconBrandColor` (hex format)
- Connection parameter types and OAuth `identityProvider` values
- `scriptOperations` cross-checked against swagger operationIds
- Valid `capabilities` values

### script.csx
Per [MS Learn: Write code in a custom connector](https://learn.microsoft.com/connectors/custom-connectors/write-code):
- File size under 1 MB
- Class named `Script` extending `ScriptBase`
- Implements `ExecuteAsync` method
- Only supported namespaces in `using` statements
- No `new HttpClient()` (use `this.Context.SendAsync`)
- Fully qualified `Newtonsoft.Json.Formatting` (avoids ambiguous references)
- Balanced braces (catches truncated files)

## JSON Output Schema

```json
{
  "connector": "MyConnector",
  "path": "/path/to/MyConnector",
  "valid": true,
  "operations": 12,
  "errors": [],
  "warnings": ["..."],
  "files": {
    "apiDefinition.swagger.json": { "valid": true, "errors": [], "warnings": [] },
    "apiProperties.json": { "valid": true, "errors": [], "warnings": [] },
    "script.csx": { "valid": true, "errors": [], "warnings": [] }
  }
}
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Validate connectors
  run: |
    npx ppcv ./MyConnector --json > result.json
    if [ $(jq '.valid' result.json) = "false" ]; then
      jq '.errors[]' result.json
      exit 1
    fi
```

## License

MIT
