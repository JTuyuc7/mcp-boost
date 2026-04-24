use napi_derive::napi;
use once_cell::sync::Lazy;
use regex::Regex;

#[napi(object)]
pub struct StaticImportMatch {
  pub bindings: String,
  pub specifier: String,
}

#[napi(object)]
pub struct ExtractedDeclaration {
  pub kind: String,
  pub name: String,
  pub lines: Vec<String>,
}

#[napi(object)]
pub struct TestContextScan {
  pub relative_imports: Vec<String>,
  pub own_exports: Vec<ExtractedDeclaration>,
}

// Mirrors the TS regex used today so behavior stays consistent.
static IMPORT_RE: Lazy<Regex> = Lazy::new(|| {
  Regex::new(r#"import\s+(?:type\s+)?(?:(\*\s+as\s+\w+|\{[^}]*\}|[\w$]+(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+))?)\s+from\s+)?['\"]([^'\"]+)['\"]"#)
    .expect("valid import regex")
});

static RELATIVE_IMPORT_RE: Lazy<Regex> = Lazy::new(|| {
  Regex::new(r#"(?m)^\s*import\s+(?:type\s+)?(?:[^'\"]*\s+from\s+)?['\"](\.[^'\"]+)['\"]"#)
    .expect("valid relative import regex")
});

static EXPORT_START_RE: Lazy<Regex> = Lazy::new(|| {
  Regex::new(
    r#"^export\s+((type\s+)?interface\s+\w+|(type\s+)?type\s+\w+|(declare\s+)?enum\s+\w+|const\s+\w+\s*[:=]|function\s+\w+\s*[<(]|(abstract\s+)?class\s+\w+|default\s+)"#,
  )
  .expect("valid export start regex")
});

static DECL_NAME_RE: Lazy<Regex> = Lazy::new(|| {
  Regex::new(r#"\b(?:interface|type|enum|const|function|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)"#)
    .expect("valid declaration name regex")
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

#[napi]
pub fn scan_test_context_source(source: String) -> TestContextScan {
  let relative_imports = RELATIVE_IMPORT_RE
    .captures_iter(&source)
    .filter_map(|caps| caps.get(1).map(|m| m.as_str().to_string()))
    .collect();

  let own_exports = extract_exported_declarations(&source);

  TestContextScan {
    relative_imports,
    own_exports,
  }
}

fn extract_exported_declarations(content: &str) -> Vec<ExtractedDeclaration> {
  let raw_lines: Vec<&str> = content.lines().collect();
  let mut declarations: Vec<ExtractedDeclaration> = Vec::new();
  let mut i: usize = 0;

  while i < raw_lines.len() {
    let line = raw_lines[i];
    let trimmed = line.trim();

    if !EXPORT_START_RE.is_match(trimmed) {
      i += 1;
      continue;
    }

    let kind = detect_kind(trimmed);
    let name = detect_name(trimmed);

    let mut block: Vec<String> = Vec::new();
    let mut depth: i32 = 0;
    let mut j = i;

    while j < raw_lines.len() {
      let current = raw_lines[j];
      block.push(current.to_string());

      let opens = current.matches('{').count() + current.matches('(').count();
      let closes = current.matches('}').count() + current.matches(')').count();
      depth += opens as i32 - closes as i32;

      if depth <= 0 && j > i {
        break;
      }

      if depth == 0 && j == i && !current.contains('{') && !current.contains('(') {
        break;
      }

      j += 1;
    }

    if block.len() > 40 {
      block.truncate(40);
    }

    declarations.push(ExtractedDeclaration {
      kind,
      name,
      lines: block,
    });

    i = j + 1;
  }

  declarations
}

fn detect_kind(line: &str) -> String {
  if line.contains("interface") {
    return "interface".to_string();
  }
  if line.contains("enum") {
    return "enum".to_string();
  }
  if line.contains("const") {
    return "const".to_string();
  }
  if line.contains("function") {
    return "function".to_string();
  }
  if line.contains("class") {
    return "class".to_string();
  }
  if line.starts_with("export type") {
    return "type".to_string();
  }
  if line.starts_with("export default") {
    return "default".to_string();
  }
  "other".to_string()
}

fn detect_name(line: &str) -> String {
  DECL_NAME_RE
    .captures(line)
    .and_then(|caps| caps.get(1).map(|m| m.as_str().to_string()))
    .unwrap_or_else(|| "(anonymous)".to_string())
}

