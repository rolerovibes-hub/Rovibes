// RoVibes Business para computador (Windows).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod impressora;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_notification::NotificationExt;

fn mostrar_principal(app: &AppHandle) {
    if let Some(janela) = app.get_webview_window("principal") {
        let _ = janela.show();
        let _ = janela.unminimize();
        let _ = janela.set_focus();
    }
}

#[tauri::command]
fn avisar(app: AppHandle, titulo: String, texto: String) -> Result<(), String> {
    app.notification().builder().title(titulo).body(texto).show().map_err(|e| e.to_string())
}

#[tauri::command]
fn listar_impressoras() -> Result<Vec<String>, String> {
    impressora::listar()
}

#[tauri::command]
fn imprimir(impressora: String, dados: Vec<u8>) -> Result<(), String> {
    impressora::imprimir(&impressora, &dados)
}

#[tauri::command]
fn dica_bandeja(app: AppHandle, texto: String) {
    if let Some(bandeja) = app.tray_by_id("principal") {
        let _ = bandeja.set_tooltip(Some(texto));
    }
}

#[tauri::command]
fn titulo_janela(janela: tauri::WebviewWindow, texto: String) {
    let _ = janela.set_title(&texto);
}

#[tauri::command]
fn tela_cheia(janela: tauri::WebviewWindow, ligar: bool) -> Result<(), String> {
    janela.set_fullscreen(ligar).map_err(|e| e.to_string())
}

#[tauri::command]
fn iniciar_com_windows(app: AppHandle, ligar: bool) -> Result<bool, String> {
    let inicio = app.autolaunch();
    let resultado = if ligar { inicio.enable() } else { inicio.disable() };
    resultado.map_err(|e| e.to_string())?;
    inicio.is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn inicia_com_windows(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn abrir_link(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Endereço inválido.".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("rundll32").args(["url.dll,FileProtocolHandler", &url]).creation_flags(0x08000000).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new("xdg-open").arg(&url).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn nova_janela(app: AppHandle, rotulo: String, titulo: String, url: String) -> Result<(), String> {
    if let Some(janela) = app.get_webview_window(&rotulo) {
        let _ = janela.show();
        let _ = janela.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, rotulo, WebviewUrl::App(url.into()))
        .title(titulo)
        .inner_size(1280.0, 800.0)
        .min_inner_size(900.0, 600.0)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| mostrar_principal(app)))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .setup(|app| {
            let abrir = MenuItem::with_id(app, "abrir", "Abrir o RoVibes Business", true, None::<&str>)?;
            let sair = MenuItem::with_id(app, "sair", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&abrir, &sair])?;
            let mut bandeja = TrayIconBuilder::with_id("principal").tooltip("RoVibes Business").menu(&menu);
            if let Some(icone) = app.default_window_icon() {
                bandeja = bandeja.icon(icone.clone());
            }
            #[allow(deprecated)]
            let bandeja = bandeja.menu_on_left_click(false);
            bandeja
                .on_menu_event(|app, evento| match evento.id.as_ref() {
                    "abrir" => mostrar_principal(app),
                    "sair" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|bandeja, evento| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = evento {
                        mostrar_principal(bandeja.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|janela, evento| {
            // Fechar a janela principal deixa o app ao lado do relógio, para continuar recebendo os avisos de pedido.
            if let tauri::WindowEvent::CloseRequested { api, .. } = evento {
                if janela.label() == "principal" {
                    api.prevent_close();
                    let _ = janela.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            avisar,
            listar_impressoras,
            imprimir,
            dica_bandeja,
            titulo_janela,
            tela_cheia,
            iniciar_com_windows,
            inicia_com_windows,
            abrir_link,
            nova_janela
        ])
        .run(tauri::generate_context!())
        .expect("não foi possível iniciar o RoVibes Business");
}
