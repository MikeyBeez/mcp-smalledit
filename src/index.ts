#!/usr/bin/env node
/**
 * MCP SmallEdit Server
 * Provides tools for making small, targeted edits to files using sed and other stream editors
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

// Initialize server
const server = new Server(
  {
    name: 'mcp-smalledit',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'sed_edit',
        description: 'Make small edits to files using sed patterns. Efficient for single-line changes, pattern replacements, and simple text transformations.',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'Path to the file to edit'
            },
            pattern: {
              type: 'string',
              description: 'Sed pattern (e.g., "s/old/new/g" for substitution)'
            },
            backup: {
              type: 'boolean',
              default: true,
              description: 'Create backup file before editing'
            },
            preview: {
              type: 'boolean',
              default: false,
              description: 'Preview changes without modifying file'
            }
          },
          required: ['file', 'pattern']
        }
      },
      {
        name: 'sed_multifile',
        description: 'Apply sed pattern to multiple files matching a glob pattern',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Sed pattern to apply'
            },
            filePattern: {
              type: 'string',
              description: 'File glob pattern (e.g., "*.ts", "src/**/*.js")'
            },
            directory: {
              type: 'string',
              default: '.',
              description: 'Starting directory for search'
            },
            backup: {
              type: 'boolean',
              default: true,
              description: 'Create backup files'
            }
          },
          required: ['pattern', 'filePattern']
        }
      },
      {
        name: 'awk_process',
        description: 'Process files using AWK for more complex operations like column manipulation, calculations, or conditional processing',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'Input file path'
            },
            script: {
              type: 'string',
              description: 'AWK script to execute'
            },
            outputFile: {
              type: 'string',
              description: 'Output file path (optional, defaults to stdout)'
            }
          },
          required: ['file', 'script']
        }
      },
      {
        name: 'quick_replace',
        description: 'Simple find and replace across a file without regex',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'File to edit'
            },
            find: {
              type: 'string',
              description: 'Text to find (literal, not regex)'
            },
            replace: {
              type: 'string',
              description: 'Text to replace with'
            },
            all: {
              type: 'boolean',
              default: true,
              description: 'Replace all occurrences (false = first only)'
            }
          },
          required: ['file', 'find', 'replace']
        }
      },
      {
        name: 'line_edit',
        description: 'Edit specific lines by number or range',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'File to edit'
            },
            lineNumber: {
              type: 'number',
              description: 'Line number to edit (1-based)'
            },
            lineRange: {
              type: 'string',
              description: 'Line range (e.g., "10,20" or "5,$")'
            },
            action: {
              type: 'string',
              enum: ['replace', 'delete', 'insert_after', 'insert_before'],
              description: 'Action to perform'
            },
            content: {
              type: 'string',
              description: 'New content (for replace/insert actions)'
            }
          },
          required: ['file', 'action']
        }
      },
      {
        name: 'perl_edit',
        description: 'Edit files using Perl one-liners (more powerful than sed, better cross-platform support)',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'File to edit'
            },
            script: {
              type: 'string', 
              description: 'Perl script (e.g., "s/old/new/g" or "$_ = uc" for uppercase)'
            },
            backup: {
              type: 'boolean',
              default: true,
              description: 'Create backup file'
            },
            multiline: {
              type: 'boolean',
              default: false,
              description: 'Enable multiline mode (-0777)'
            }
          },
          required: ['file', 'script']
        }
      },
      {
        name: 'diff_preview', 
        description: 'Preview what changes would be made by showing a diff',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'File to preview changes for'
            },
            command: {
              type: 'string',
              description: 'Command that would make changes (e.g., "s/old/new/g")'
            },
            tool: {
              type: 'string',
              enum: ['sed', 'perl', 'awk'],
              default: 'perl',
              description: 'Which tool to use for the preview'
            }
          },
          required: ['file', 'command']
        }
      }
    ]
  };
});

// Help content for each tool
const helpContent = {
  overview: `SmallEdit MCP Tool - Help
========================
Provides efficient tools for small, targeted file edits.

Available tools:
- sed_edit: Pattern-based file editing (uses perl backend)
- perl_edit: Direct perl one-liner execution
- quick_replace: Simple find/replace without regex
- line_edit: Edit specific lines by number
- awk_process: AWK script processing
- sed_multifile: Apply patterns to multiple files
- diff_preview: Preview changes before applying
- help: This help system

🎯 WHEN TO USE SMALLEDIT vs FILESYSTEM TOOLS:
==========================================
USE SMALLEDIT FOR:
- Single line changes
- Simple pattern replacements  
- Version number updates
- Removing debug statements
- Quick find/replace operations
- Bulk simple edits across files

USE FILESYSTEM TOOLS INSTEAD FOR:
- Multi-line code blocks
- Complex JSON/YAML structures
- Adding new functions or classes
- Large refactoring operations
- Any edit that's hard to express as a pattern
- When you need precise control over formatting

⚠️ COMMON ISSUES TO AVOID:
- Don't use smalledit for complex multi-line edits
- Be careful with quotes in shell commands
- Always preview changes first with diff_preview
- Clean up .bak files periodically
- Remember perl syntax differs from sed

💡 BETTER ALTERNATIVES:
- Instead of sed → Use perl (more portable)
- For JSON files → Consider jq instead
- For YAML files → Consider yq instead  
- For modern sed → Install 'sd' (brew install sd)
- For better grep → Use ripgrep (rg)

General tips:
- Always use preview/diff_preview to test first
- Backups are created by default (.bak files)
- Perl patterns are more portable than sed
- Use quotes carefully in patterns

🛑 TROUBLESHOOTING:
================
If you see errors like:
- "undefined label 'ard/Code'" → macOS sed issue, use perl instead
- "unterminated substitute" → Quote escaping problem
- "extra characters at end" → Multi-line content issue, use filesystem tools
- "division by zero" (awk) → Check field separators and data format

📦 SMALLEDIT PHILOSOPHY:
=====================
SmallEdit is designed for SMALL edits. If you're trying to do something
complex and getting errors, you're probably using the wrong tool.
That's not a bug - it's a feature! Use filesystem:edit_file instead.
`,
  sed_edit: `sed_edit - Pattern-based file editing
===================================
Uses perl backend for cross-platform compatibility.

Examples:
  // Simple replacement
  sed_edit({ file: "config.json", pattern: "s/localhost/production/g" })
  
  // Delete lines containing pattern
  sed_edit({ file: "app.js", pattern: "$_ = '' if /console\\.log/" })
  
  // Preview changes first
  sed_edit({ file: "test.txt", pattern: "s/old/new/g", preview: true })
  
  // Edit without backup
  sed_edit({ file: "temp.txt", pattern: "s/a/b/g", backup: false })

Note: Actually uses perl internally for better compatibility.

WHEN NOT TO USE:
- Multi-line replacements
- Complex code modifications  
- JSON/YAML structure changes
→ Use filesystem:edit_file instead!
`,
  perl_edit: `perl_edit - Perl one-liner execution
===================================
Direct access to perl's text processing power.

Examples:
  // Simple substitution
  perl_edit({ file: "data.txt", script: "s/foo/bar/g" })
  
  // Delete lines
  perl_edit({ file: "log.txt", script: "$_ = '' if /DEBUG/" })
  
  // Transform to uppercase
  perl_edit({ file: "names.txt", script: "$_ = uc" })
  
  // Complex multiline operations
  perl_edit({ 
    file: "code.js", 
    script: "s/function\\s+(\\w+)\\s*\\(/const $1 = (/g",
    multiline: true 
  })

Tips:
- Use $_ for the current line
- Escape backslashes in regex
- multiline mode slurps entire file
`,
  quick_replace: `quick_replace - Simple find and replace
=====================================
Literal text replacement without regex.

Examples:
  // Replace all occurrences
  quick_replace({ file: "doc.txt", find: "Version 1.0", replace: "Version 2.0" })
  
  // Replace only first occurrence  
  quick_replace({ file: "config.ini", find: "debug=true", replace: "debug=false", all: false })
  
  // Replace with special characters
  quick_replace({ file: "data.csv", find: "$price", replace: "\\$19.99" })

Note: Special regex characters are automatically escaped.
`,
  line_edit: `line_edit - Line-specific operations
==================================
Edit, delete, or insert at specific line numbers.

Examples:
  // Replace line 10
  line_edit({ file: "list.txt", lineNumber: 10, action: "replace", content: "New line 10" })
  
  // Delete lines 5-15
  line_edit({ file: "data.txt", lineRange: "5,15", action: "delete" })
  
  // Insert after line 1
  line_edit({ file: "imports.js", lineNumber: 1, action: "insert_after", content: "import React from 'react';" })
  
  // Insert before last line
  line_edit({ file: "footer.html", lineRange: "$", action: "insert_before", content: "<!-- Updated -->" })

Ranges:
- Single line: lineNumber: 42
- Range: lineRange: "10,20" 
- To end: lineRange: "5,$"
`,
  awk_process: `awk_process - AWK script processing
=================================
Powerful text processing with AWK.

Examples:
  // Sum second column
  awk_process({ file: "numbers.txt", script: "{sum += $2} END {print sum}" })
  
  // Process CSV (comma-separated)
  awk_process({ file: "data.csv", script: "BEGIN{FS=\",\"} {print $1, $3}" })
  
  // Filter and calculate
  awk_process({ 
    file: "sales.txt", 
    script: "$3 > 100 {count++; total += $3} END {print \"Count:\", count, \"Avg:\", total/count}"
  })
  
  // Output to file
  awk_process({ file: "input.txt", script: "{print $2, $1}", outputFile: "reversed.txt" })

Tips:
- Use FS for field separator
- $1, $2 etc are fields
- NR is line number
- END block runs after processing
`,
  sed_multifile: `sed_multifile - Multi-file operations  
===================================
Apply patterns to multiple files at once.

Examples:
  // Update all JS files
  sed_multifile({ filePattern: "*.js", pattern: "s/var /let /g" })
  
  // Process files in subdirectories
  sed_multifile({ 
    directory: "./src", 
    filePattern: "*.ts", 
    pattern: "s/console\\.log.*//g" 
  })
  
  // Without backups (careful!)
  sed_multifile({ filePattern: "*.tmp", pattern: "s/old/new/g", backup: false })

Note: Uses perl internally. Be careful with patterns affecting many files!
`,
  diff_preview: `diff_preview - Preview changes
============================
See what changes would be made before applying.

Examples:
  // Preview perl substitution
  diff_preview({ file: "config.json", command: "s/8080/3000/g" })
  
  // Preview with sed syntax
  diff_preview({ file: "data.txt", command: "10,20d", tool: "sed" })
  
  // Preview AWK processing  
  diff_preview({ file: "log.csv", command: "BEGIN{FS=\",\"} {print $2}", tool: "awk" })

Output:
- Shows unified diff format
- No changes made to original file
- Temp files are cleaned up
`
};

// Tool implementation handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case 'sed_edit': {
        const { file, pattern, backup = true, preview = false } = args;
        
        // Check if file exists
        if (!existsSync(file)) {
          throw new Error(`File not found: ${file}`);
        }
        
        // Build sed command - use perl for better compatibility
        let sedCmd;
        if (preview) {
          // For preview, create a temp copy and diff
          const tempFile = `${file}.preview.tmp`;
          await execAsync(`rm -f .bak; cp '${file}' '${tempFile}'`);
          
          // Apply change to temp file
          sedCmd = `perl -i -pe '${pattern}' '${tempFile}' && diff -u '${file}' '${tempFile}' | head -50; rm -f '${tempFile}'`;
        } else {
          // Use perl for actual edits (more portable than sed)
          const backupExt = backup ? '.bak' : '';
          sedCmd = `perl -i${backupExt} -pe '${pattern}' '${file}'`;
        }
        
        const { stdout, stderr } = await execAsync(sedCmd);
        
        if (stderr) {
          throw new Error(`Sed error: ${stderr}`);
        }
        
        return {
          content: [
            {
              type: 'text',
              text: preview ? 
                `Preview of changes:\n${stdout || 'No changes would be made'}` :
                `Successfully edited ${file}${backup ? ' (backup created as .bak)' : ''}`
            }
          ]
        };
      }
      
      case 'sed_multifile': {
        const { pattern, filePattern, directory = '.', backup = true } = args;
        
        // Use find to get files matching pattern
        const findCmd = `find ${directory} -name "${filePattern}" -type f`;
        const { stdout: files } = await execAsync(findCmd);
        
        if (!files.trim()) {
          return {
            content: [{
              type: 'text',
              text: `No files found matching pattern: ${filePattern}`
            }]
          };
        }
        
        const fileList = files.trim().split('\n');
        const results = [];
        
        for (const file of fileList) {
          try {
            const backupExt = backup ? '.bak' : '';
            const sedCmd = `perl -i${backupExt} -pe '${pattern}' '${file}'`;
            await execAsync(sedCmd);
            results.push(`✓ ${file}`);
          } catch (error) {
            results.push(`✗ ${file}: ${error.message}`);
          }
        }
        
        return {
          content: [{
            type: 'text',
            text: `Processed ${fileList.length} files:\n${results.join('\n')}`
          }]
        };
      }
      
      case 'awk_process': {
        const { file, script, outputFile } = args;
        
        if (!existsSync(file)) {
          throw new Error(`File not found: ${file}`);
        }
        
        let awkCmd = `awk '${script}' '${file}'`;
        if (outputFile) {
          awkCmd += ` > '${outputFile}'`;
        }
        
        const { stdout, stderr } = await execAsync(awkCmd);
        
        if (stderr) {
          throw new Error(`AWK error: ${stderr}`);
        }
        
        return {
          content: [{
            type: 'text',
            text: outputFile ? 
              `Processed ${file} -> ${outputFile}` :
              stdout || 'AWK processing complete'
          }]
        };
      }
      
      case 'quick_replace': {
        const { file, find, replace, all = true } = args;
        
        if (!existsSync(file)) {
          throw new Error(`File not found: ${file}`);
        }
        
        // Escape special characters for sed
        const escapedFind = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedReplace = replace.replace(/[&/\\]/g, '\\$&');
        
        const pattern = all ? 
          `s/${escapedFind}/${escapedReplace}/g` :
          `s/${escapedFind}/${escapedReplace}/`;
        
        const sedCmd = `sed -i.bak '${pattern}' '${file}'`;
        await execAsync(sedCmd);
        
        return {
          content: [{
            type: 'text',
            text: `Replaced "${find}" with "${replace}" in ${file}`
          }]
        };
      }
      
      case 'line_edit': {
        const { file, lineNumber, lineRange, action, content } = args;
        
        if (!existsSync(file)) {
          throw new Error(`File not found: ${file}`);
        }
        
        let sedCmd = 'sed -i.bak ';
        const range = lineRange || `${lineNumber}`;
        
        switch (action) {
          case 'replace':
            sedCmd += `'${range}s/.*/${content}/' '${file}'`;
            break;
          case 'delete':
            sedCmd += `'${range}d' '${file}'`;
            break;
          case 'insert_after':
            sedCmd += `'${range}a\\
${content}' '${file}'`;
            break;
          case 'insert_before':
            sedCmd += `'${range}i\\
${content}' '${file}'`;
            break;
          default:
            throw new Error(`Unknown action: ${action}`);
        }
        
        await execAsync(sedCmd);
        
        return {
          content: [{
            type: 'text',
            text: `Successfully performed ${action} on line(s) ${range} in ${file}`
          }]
        };
      }
      
      case 'perl_edit': {
        const { file, script, backup = true, multiline = false } = args;
        
        if (!existsSync(file)) {
          throw new Error(`File not found: ${file}`);
        }
        
        const backupExt = backup ? '.bak' : '';
        const multilineFlag = multiline ? '-0777 ' : '';
        const perlCmd = `perl -i${backupExt} ${multilineFlag}-pe '${script}' '${file}'`;
        
        await execAsync(perlCmd);
        
        return {
          content: [{
            type: 'text',
            text: `Successfully edited ${file} using Perl${backup ? ' (backup created as .bak)' : ''}`
          }]
        };
      }
      
      case 'diff_preview': {
        const { file, command, tool = 'perl' } = args;
        
        if (!existsSync(file)) {
          throw new Error(`File not found: ${file}`);
        }
        
        // Create temp file
        const tempFile = `${file}.preview.tmp`;
        await execAsync(`rm -f .bak; cp '${file}' '${tempFile}'`);
        
        // Apply command to temp file
        let editCmd;
        switch (tool) {
          case 'perl':
            editCmd = `perl -i -pe '${command}' '${tempFile}'`;
            break;
          case 'sed':
            editCmd = `sed -i.tmp '${command}' '${tempFile}' && rm -f '${tempFile}.tmp'`;
            break;
          case 'awk':
            editCmd = `awk '${command}' '${tempFile}' > '${tempFile}.new' && mv '${tempFile}.new' '${tempFile}'`;
            break;
        }
        
        await execAsync(editCmd);
        
        // Generate diff
        const { stdout } = await execAsync(`diff -u '${file}' '${tempFile}' || true`);
        
        // Cleanup
        await execAsync(`rm -f '${tempFile}'`);
        
        return {
          content: [{
            type: 'text',
            text: stdout ? `Preview of changes:\n${stdout}` : 'No changes would be made'
          }]
        };
      }
      
      case 'help': {
        const { tool = 'all' } = args;
        
        const helpKey = tool === 'all' ? 'overview' : tool;
        const content = helpContent[helpKey] || `No help available for tool: ${tool}\n\nAvailable tools: ${Object.keys(helpContent).join(', ')}`;
        
        return {
          content: [{
            type: 'text',
            text: content
          }]
        };
      }
      
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
});

// Start the server
const transport = new StdioServerTransport();
server.connect(transport);
console.error('MCP SmallEdit server running on stdio');
