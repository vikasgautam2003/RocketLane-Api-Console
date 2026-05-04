use std::collections::HashMap;

#[tauri::command]
async fn native_http_post(
    url: String,
    headers: HashMap<String, String>,
    body: String,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let mut req = client.post(&url).body(body);
    for (k, v) in &headers {
        req = req.header(k.as_str(), v.as_str());
    }
    let response = req.send().await.map_err(|e| e.to_string())?;
    response.text().await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![native_http_post])
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
