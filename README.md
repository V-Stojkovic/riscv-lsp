# RISC-V Assembly Language Server & Support

A powerful, custom Language Server Protocol (LSP) and syntax highlighter for RISC-V assembly code (`.s`, `.asm`, `.S`). 

Provides a couple additional features over a standard syntax highlighter. The main features are the tracking of stack usage and label defintions. This was created with the bennett assembler in mind

## Features

### Intelligent Diagnostics (LSP)
* **Undefined Label Detection:** Instantly flags jumps (`j`, `jal`), branches (`beq`, `bne`, etc.), and address loads (`la`) that reference labels that don't exist.
* **Duplicate Label Prevention:** Throws an error if you try to define the same function or data label twice.
* **Stack Tracking:** Prevents standard assembly memory leaks.
  * Tracks mathematical stack offsets (`addi sp, sp, -8` / `subi sp, sp, 8`).
  * Tracks exact register pushes and pops (e.g., `sw t0, [sp]` and `lw t0, [sp]`).
  * Warns you on `ret` if the stack pointer is unbalanced or if a specific register was left abandoned on the stack.
* **Memory Alignment Checks:** Warns you if word (`lw`/`sw`) or half-word (`lh`/`sh`) operations are using 

### Syntax Highlighting
* Full TextMate grammar support for the RISC-V base instruction set and standard pseudoinstructions.
* **Smart Label Parsing:** Supports both standard GNU syntax (`main:`) and colon-less labels (`main`).
* Rich coloring for strings (`"text"`), characters (`'A'`), hex literals (`0x1F`), decimals, and hardware registers.

### Bennett Assembler Directives
Built-in support for custom data allocation directives:
* `defw` (Define Word) and `defb` (Define Byte).
* Full parsing of complex mathematical expressions for data allocation.
* *Example:* `label_n defw (label_1 - label_2) * (label_3 / 4)` (The LSP actively verifies that `label_1`, `label_2`, and `label_3` exist in your document).

### Quality of Life
* **Smart Commenting:** Press `Cmd + /` (Mac) or `Ctrl + /` (Windows) to instantly toggle standard `;` line comments.
* **Auto-closing:** Automatically pairs brackets `()`, `[]`, `{}`, and quotes.
* **Go-To-Definition** `Cmd + <click>` (Mac) or `Ctrl + <click>`(Windows) to go to definition of a label

## Usage

Simply open any `.s`, `.asm`, or `.S` file. Ensure the Language Mode in the bottom right corner of VS Code is set to **RISC-V**. 

The Language Server will automatically spin up in the background and begin analyzing your code as you type.

### Example: Stack Tracking in Action
```assembly
my_function:
    addi sp, sp, -8
    sw t0, [sp]       # LSP registers t0 as pushed
    
    lw t0, [sp]       # LSP registers t0 as popped
    lw t1, [sp]       # WARNING: t1 popped more than pushed!
    
    ret               # WARNING: sp offset is -8 at return!
```
## Development & Contributing
This extension is built with standard VS Code Extension APIs and TypeScript.

### Running locally
1. Clone this repository
2. Run `npm install`
3. Open the project in VS Code and press `F5` to launch the Extension Development Host.

## Testing
If you are planning on contributing, it is a good idea to make sure that any changes still
pass all the tests in the test suite. The CI will run all tests on a push/pull request.

To run the tests locally
```bash 
npm run test
```

## Neovim Setup (nvim-lspconfig / Neovim 0.11+)

This LSP server can be used in Neovim via the built-in LSP client.

### Requirements

* Neovim **0.11+**
* Node.js installed
* `npm install` run in the plugin directory
* `npm run build` (or `tsc -p tsconfig.json`) executed once

---

## Lazy.nvim configuration (recommended)

```lua
return {
  "V-Stojkovic/riscv-lsp",

  config = function()
    local lsp = vim.lsp

    -- Register filetypes
    vim.filetype.add({
      extension = {
        s = "riscv_asm",
        S = "riscv_asm",
        asm = "riscv_asm",
      },
    })

    -- Path to the language server inside lazy.nvim
    local plugin_path = vim.fn.stdpath("data") .. "/lazy/riscv-lsp"
    local server_path = plugin_path .. "/out/server.js"

    -- Helpful warnings (non-blocking)
    if vim.fn.filereadable(server_path) == 0 then
      vim.notify(
        "riscv-lsp: missing server.js. Run 'npm run build' in plugin directory.",
        vim.log.levels.WARN
      )
    end

    if vim.fn.isdirectory(plugin_path .. "/node_modules") == 0 then
      vim.notify(
        "riscv-lsp: missing dependencies. Run 'npm install' in plugin directory.",
        vim.log.levels.WARN
      )
    end

    -- LSP configuration
    lsp.config("riscv_lsp", {
      cmd = { "node", server_path },

      filetypes = { "riscv_asm" },

      root_markers = { ".git" },

      single_file_support = true,
    })

    lsp.enable("riscv_lsp")
  end,
}
```

---

## Filetypes supported

* `.s`
* `.S`
* `.asm`

---

## Manual install (if not using lazy.nvim)

```lua
vim.lsp.config("riscv_lsp", {
  cmd = { "node", "/path/to/riscv-lsp/out/server.js" },
  filetypes = { "riscv_asm" },
  root_markers = { ".git" },
})

vim.lsp.enable("riscv_lsp")
```

---

## Notes

* The server must be built before Neovim can start it.
* If you change TypeScript files, re-run `npm run build`.
* This LSP uses a simple Node-based transport (stdio).

---
