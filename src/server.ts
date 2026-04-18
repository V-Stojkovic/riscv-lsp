import {
    createConnection, TextDocuments, ProposedFeatures, TextDocumentSyncKind, InitializeParams, InitializeResult,
    Hover, MarkupKind, Location, Position, StreamMessageReader, StreamMessageWriter
} from 'vscode-languageserver/node';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { analyzeText } from './analyzer';
import { ParsedLabel} from './types'
import { CSR_REGISTERS,CSR_INSTRUCTIONS } from './constants';

const isNodeIPC = !!(process as any).send;

// VSCode extension host will use IPC
// Neovim / standalone will use stdio
const connection = isNodeIPC
  ? createConnection(ProposedFeatures.all)
  : createConnection(
      ProposedFeatures.all,
      new StreamMessageReader(process.stdin),
      new StreamMessageWriter(process.stdout)
    );

const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// SWE Pro-Tip: Map the labels to the specific file URI so multi-tab setups don't overwrite each other!
const documentLabelsCache = new Map<string, Map<string, ParsedLabel>>();

connection.onInitialize((params: InitializeParams) => {
    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            hoverProvider: true,      
            definitionProvider: true  
        }
    };
    return result;
});


documents.onDidChangeContent(change => {
    validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
    const text = textDocument.getText();
    const result = analyzeText(text, textDocument.uri);
    
    // Save the labels specifically for this document URI
    documentLabelsCache.set(textDocument.uri, result.labels);
    
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: result.diagnostics });
}

function getWordAtPosition(document: TextDocument, position: Position): string | null {
    const text = document.getText();
    const lines = text.split(/\r?\n/);
    const line = lines[position.line];
    if (!line) return null;

    const wordRegex = /[a-zA-Z_.][a-zA-Z0-9_.]*/g;
    let match;
    while ((match = wordRegex.exec(line)) !== null) {
        if (position.character >= match.index && position.character <= match.index + match[0].length) {
            return match[0];
        }
    }
    return null;
}

// --- FEATURE 1: Hover Information ---
connection.onHover((params): Hover | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const word = getWordAtPosition(document, params.position);
    if (!word) return null;
    const lowerWord = word.toLowerCase();

    // 1. Check if the word is a CSR Instruction
    if (lowerWord in CSR_INSTRUCTIONS) {
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `\`\`\`riscv\n(instruction) ${lowerWord.toUpperCase()}\n\`\`\`\n*${CSR_INSTRUCTIONS[lowerWord]}*`
            }
        };
    }
    if (lowerWord in CSR_REGISTERS) {
        const csr = CSR_REGISTERS[lowerWord];
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `\`\`\`riscv\n(CSR) ${word.toUpperCase()} [${csr.address}]\n\`\`\`\n*${csr.description}*`
            }
        };
    }

    const fileLabels = documentLabelsCache.get(params.textDocument.uri);
    if (!fileLabels) return null;

    const label = fileLabels.get(word);
    if (label) {
        // 1. Extract a clean filename from the URI
        let fileName = 'unsaved file';
        if (label.uri) {
            try {
                // Convert the file:// URI back to a standard hard-drive path
                const fsPath = fileURLToPath(label.uri);
                // Extract just the filename (e.g., 'timer_lib.s')
                fileName = path.basename(fsPath);
            } catch (e) {
                // Fallback just in case the URI format is unexpected
                fileName = label.uri.substring(label.uri.lastIndexOf('/') + 1);
            }
        }

        // 2. Convert 0-indexed array line to 1-indexed human line
        const lineNumber = (label.line !== undefined && label.line >= 0) ? (label.line + 1).toString() : 'unknown';

        // 3. Construct the Markdown string
        let markdownText = '';
        if (label.type === 'constant') {
            markdownText = `\`\`\`riscv\n(constant) ${label.name} EQU ${label.value}\n\`\`\`\n*Defined in ${fileName}, line ${lineNumber}*`;
        } else if (label.type === 'offset') {
            markdownText = `\`\`\`riscv\n(offset) ${label.name} = ${label.value}\n\`\`\`\n*Defined in ${fileName}, line ${lineNumber}*`;
        } else {
            markdownText = `\`\`\`riscv\n(label) ${label.name}\n\`\`\`\n*Defined in ${fileName}, line ${lineNumber}*`;
        }

        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: markdownText
            }
        };
    }
    return null;
});

// --- FEATURE 2: Go To Definition ---
connection.onDefinition((params): Location | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const word = getWordAtPosition(document, params.position);
    if (!word) return null;

    const fileLabels = documentLabelsCache.get(params.textDocument.uri);
    if (!fileLabels) return null;

    const label = fileLabels.get(word);
    if (label && label.uri) {
        return {
            uri: label.uri,
            range: {
                start: { line: label.line, character: 0 },
                end: { line: label.line, character: label.name.length }
            }
        };
    }
    return null;
});

documents.listen(connection);
connection.listen();
