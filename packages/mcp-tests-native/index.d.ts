export interface StaticImportMatch {
  bindings: string;
  specifier: string;
}

export declare function extractStaticImports(source: string): StaticImportMatch[];

