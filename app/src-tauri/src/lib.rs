
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

const BUILD_FILE_NAMES: &[&str] = &[
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "settings.gradle",
    "settings.gradle.kts",
];

const SKIP_DIRS: &[&str] = &[
    "target", "build", "out", "dist", "bin",
    "node_modules", ".git", ".idea", ".gradle", ".mvn",
];

const MAX_SCAN_DEPTH: usize = 8;
const MAX_JAVA_FILES_SAMPLE: usize = 200;

/// Resolve o executável Java e o JAR da engine.
///
/// Em produção (app empacotado) usa o JRE e o JAR incluídos como *resources*;
/// em desenvolvimento recai para o `java` do sistema e o JAR gerado por
/// `mvn package` no módulo engine.
fn resolve_runtime(app: &AppHandle) -> (PathBuf, PathBuf) {
    let java_rel = if cfg!(target_os = "windows") {
        "resources/jre/bin/java.exe"
    } else {
        "resources/jre/bin/java"
    };

    let bundled_java = app
        .path()
        .resolve(java_rel, BaseDirectory::Resource)
        .ok()
        .filter(|p| p.exists());
    let bundled_jar = app
        .path()
        .resolve("resources/engine.jar", BaseDirectory::Resource)
        .ok()
        .filter(|p| p.exists());

    let java = bundled_java.unwrap_or_else(|| PathBuf::from("java"));
    let jar = bundled_jar.unwrap_or_else(dev_jar_path);
    (java, jar)
}

fn dev_jar_path() -> PathBuf {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir.join("../../engine/target/structural-1.0-SNAPSHOT-jar-with-dependencies.jar")
}

struct ProjectScan {
    has_root_build_file: bool,
    has_root_src: bool,
    nested_build_files: Vec<PathBuf>,
    java_file_count: usize,
}

fn scan_project(root: &Path) -> ProjectScan {
    let mut scan = ProjectScan {
        has_root_build_file: false,
        has_root_src: false,
        nested_build_files: Vec::new(),
        java_file_count: 0,
    };

    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            if path.is_file() && BUILD_FILE_NAMES.contains(&name.as_str()) {
                scan.has_root_build_file = true;
            }
            if path.is_dir() && name == "src" {
                scan.has_root_src = true;
            }
        }
    }

    walk(root, root, 0, &mut scan);
    scan
}

fn walk(root: &Path, dir: &Path, depth: usize, scan: &mut ProjectScan) {
    if depth > MAX_SCAN_DEPTH {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();

        if path.is_dir() {
            if SKIP_DIRS.contains(&name.as_str()) || name.starts_with('.') {
                continue;
            }
            walk(root, &path, depth + 1, scan);
        } else if path.is_file() {
            if BUILD_FILE_NAMES.contains(&name.as_str()) && depth > 0 {
                if let Ok(rel) = path.strip_prefix(root) {
                    scan.nested_build_files.push(rel.to_path_buf());
                }
            }
            if name.ends_with(".java") && scan.java_file_count < MAX_JAVA_FILES_SAMPLE {
                scan.java_file_count += 1;
            }
        }
    }
}

fn top_level_project_roots(nested: &[PathBuf]) -> Vec<PathBuf> {
    let mut parents: Vec<PathBuf> = nested
        .iter()
        .filter_map(|p| p.parent().map(|x| x.to_path_buf()))
        .filter(|p| !p.as_os_str().is_empty())
        .collect();
    parents.sort();
    parents.dedup();

    let mut roots: Vec<PathBuf> = Vec::new();
    for p in &parents {
        if !parents.iter().any(|other| other != p && p.starts_with(other)) {
            roots.push(p.clone());
        }
    }
    roots
}

fn validate_java_project(project_path: &str) -> Result<(), String> {
    let path = Path::new(project_path);

    if !path.exists() {
        return Err(format!(
            "O caminho selecionado não existe: {}",
            path.display()
        ));
    }

    if !path.is_dir() {
        return Err(format!(
            "O caminho selecionado não é uma pasta: {}",
            path.display()
        ));
    }

    let scan = scan_project(path);

    if scan.java_file_count == 0 {
        return Err(format!(
            "A pasta selecionada não parece ser um projeto Java: nenhum arquivo .java foi encontrado em '{}'. Verifique se você selecionou a raiz correta do projeto.",
            path.display()
        ));
    }

    if scan.has_root_build_file {
        return Ok(());
    }

    let nested_roots = top_level_project_roots(&scan.nested_build_files);

    if nested_roots.len() > 1 {
        let sample: Vec<String> = nested_roots
            .iter()
            .take(3)
            .map(|p| format!("'{}'", p.display()))
            .collect();
        let more = if nested_roots.len() > 3 {
            format!(" e mais {}", nested_roots.len() - 3)
        } else {
            String::new()
        };
        return Err(format!(
            "A pasta selecionada contém múltiplos projetos Java independentes ({}{}). Selecione a raiz de um único projeto para evitar mistura de resultados.",
            sample.join(", "),
            more
        ));
    }

    if nested_roots.len() == 1 {
        return Err(format!(
            "Um projeto Java foi encontrado na subpasta '{}', mas a raiz selecionada não contém arquivo de build (pom.xml, build.gradle). Selecione a subpasta do projeto.",
            nested_roots[0].display()
        ));
    }

    if !scan.has_root_src {
        return Err(
            "A pasta selecionada não parece ser um projeto Java válido. Esperado: pom.xml, build.gradle ou um diretório src/ na raiz.".to_string(),
        );
    }

    Ok(())
}

#[tauri::command]
async fn analyze_project(app: AppHandle, project_path: String) -> Result<String, String> {
    let (java_path, jar_path) = resolve_runtime(&app);
    if !jar_path.exists() {
        return Err(format!(
            "JAR do motor de análise não encontrado em: {}. Execute 'mvn package' no módulo engine.",
            jar_path.display()
        ));
    }

    validate_java_project(&project_path)?;

    tauri::async_runtime::spawn_blocking(move || {
        let output = Command::new(&java_path)
            .arg("-jar")
            .arg(&jar_path)
            .arg(&project_path)
            .output()
            .map_err(|e| format!("Falha ao executar o Java ({}): {}. Verifique se o runtime Java está disponível.", java_path.display(), e))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            Err(translate_engine_error(&stderr))
        }
    })
    .await
    .map_err(|e| format!("Erro ao aguardar a análise: {}", e))?
}

fn translate_engine_error(stderr: &str) -> String {
    let first_line = stderr
        .lines()
        .find(|l| !l.trim().is_empty() && !l.starts_with("\tat ") && !l.starts_with("Caused by:"))
        .unwrap_or(stderr)
        .trim();

    if first_line.contains("Nenhum arquivo .java") {
        return "A pasta selecionada não parece ser um projeto Java: nenhum arquivo .java foi encontrado. Verifique se você selecionou a raiz correta do projeto.".to_string();
    }

    if first_line.contains("Múltiplos projetos") || first_line.contains("duplicad") {
        return first_line.to_string();
    }

    if first_line.contains("não é um diretório") {
        return "O caminho selecionado não é uma pasta válida.".to_string();
    }

    if first_line.contains("OutOfMemoryError") || stderr.contains("OutOfMemoryError") {
        return "Projeto grande demais para a memória disponível. Aumente o heap do Java (ex.: JAVA_OPTS=-Xmx4g).".to_string();
    }

    format!("Falha durante a análise: {}", first_line)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![analyze_project])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
