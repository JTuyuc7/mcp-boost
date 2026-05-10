export interface StaticImportMatch {
  bindings: string;
  specifier: string;
}

export interface ExtractedDeclaration {
  kind: string;
  name: string;
  lines: string[];
}

export interface TestContextScan {
  relativeImports: string[];
  ownExports: ExtractedDeclaration[];
}

export declare function extractStaticImports(source: string): StaticImportMatch[];
export declare function scanTestContextSource(source: string): TestContextScan;
