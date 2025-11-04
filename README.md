# MCP SmallEdit

A Model Context Protocol (MCP) server that provides tools for making small, targeted edits to files using stream editors like `sed` and `awk`.

<a href="https://glama.ai/mcp/servers/@MikeyBeez/mcp-smalledit">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@MikeyBeez/mcp-smalledit/badge" alt="SmallEdit MCP server" />
</a>

## Why SmallEdit?

When making minor changes to files (fixing typos, updating version numbers, changing config values), using full file replacement is inefficient. SmallEdit provides targeted editing capabilities that:

- Save tokens by only specifying what to change
- Reduce errors by not rewriting entire files
- Enable bulk operations across multiple files
- Provide preview capabilities before applying changes

## Installation

```bash
npm install -g @bard/mcp-smalledit
```

## Tools Available

### 1. `sed_edit`
Make small edits using sed patterns.

**Examples:**
```javascript
// Replace all occurrences
sed_edit({
  file: "package.json",
  pattern: "s/0.1.0/0.2.0/g"
})

// Delete lines containing pattern
sed_edit({
  file: "config.ts",
  pattern: "/DEBUG_MODE/d"
})

// Preview changes first
sed_edit({
  file: "index.ts",
  pattern: "s/foo/bar/g",
  preview: true
})
```

### 2. `sed_multifile`
Apply patterns to multiple files.

**Examples:**
```javascript
// Update imports across all TypeScript files
sed_multifile({
  pattern: "s/'.\\//src\\//g",
  filePattern: "*.ts",
  directory: "src"
})

// Remove console.log from all JS files
sed_multifile({
  pattern: "/console\\.log/d",
  filePattern: "*.js"
})
```

### 3. `quick_replace`
Simple find and replace without regex.

**Examples:**
```javascript
// Replace text literally
quick_replace({
  file: "README.md",
  find: "version 1.0",
  replace: "version 2.0"
})

// Replace only first occurrence
quick_replace({
  file: "config.json",
  find: "localhost",
  replace: "production.server.com",
  all: false
})
```

### 4. `line_edit`
Edit specific lines by number.

**Examples:**
```javascript
// Replace line 42
line_edit({
  file: "index.ts",
  lineNumber: 42,
  action: "replace",
  content: "export const VERSION = '2.0.0';"
})

// Delete lines 10-20
line_edit({
  file: "test.ts",
  lineRange: "10,20",
  action: "delete"
})

// Insert after line 5
line_edit({
  file: "imports.ts",
  lineNumber: 5,
  action: "insert_after",
  content: "import { newModule } from './new-module';"
})
```

### 5. `awk_process`
Process files with AWK for complex operations.

**Examples:**
```javascript
// Sum numbers in second column
awk_process({
  file: "data.csv",
  script: "{sum += $2} END {print sum}"
})

// Extract specific columns
awk_process({
  file: "data.tsv",
  script: "{print $1, $3}",
  outputFile: "extracted.txt"
})
```

## Configuration

Add to your MCP client config:

```json
{
  "mcpServers": {
    "smalledit": {
      "command": "mcp-smalledit"
    }
  }
}
```

## Common Use Cases

### Version Bumping
```javascript
sed_edit({
  file: "package.json",
  pattern: 's/"version": "[^"]*"/"version": "1.2.3"/g'
})
```

### Update Import Paths
```javascript
sed_multifile({
  pattern: "s|'@old/package|'@new/package|g",
  filePattern: "*.ts"
})
```

### Remove Debug Code
```javascript
sed_multifile({
  pattern: "/\\/\\/\\s*DEBUG:/d",
  filePattern: "*.js"
})
```

### Fix Formatting
```javascript
// Add missing semicolons
sed_multifile({
  pattern: "s/^\\([^;]*\\)$/\\1;/",
  filePattern: "*.ts"
})
```

## Safety Features

- **Automatic Backups**: Creates `.bak` files by default
- **Preview Mode**: Test patterns before applying
- **Error Handling**: Clear error messages for invalid patterns
- **File Validation**: Checks file existence before editing

## Notes

- All file paths are relative to the current working directory
- Backup files (`.bak`) are created by default unless disabled
- Use preview mode to test complex patterns
- Escape special characters appropriately in patterns

## License

MIT