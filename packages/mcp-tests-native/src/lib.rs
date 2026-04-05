use napi_derive::napi;
use once_cell::sync::Lazy;
use regex::Regex;

#[napi(object)]
pub struct StaticImportMatch {
  pub bindings: String,
  pub specifier: String,
}

// Mirrors the TS regex used today so behavior stays consistent.
static IMPORT_RE: Lazy<Regex> = Lazy::new(|| {
  Regex::new(r#"import\s+(?:type\s+)?(?:(\*\s+as\s+\w+|\{[^}]*\}|[\w$]+(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+))?)\s+from\s+)?['\"]([^'\"]+)['\"]"#)
    .expect("valid import regex")
});

#[napi]
pub fn extract_static_imports(source: String) -> Vec<StaticImportMatch> {
  IMPORT_RE
    .captures_iter(&source)
    .map(|caps| StaticImportMatch {
      bindings: caps
        .get(1)
        .map(|m| m.as_str().to_string())
        .unwrap_or_default(),
      specifier: caps
        .get(2)
        .map(|m| m.as_str().to_string())
        .unwrap_or_default(),
    })
    .collect()
}

