//! Impressão direta (RAW/ESC-POS) pelo spooler do Windows, sem a janela de imprimir.

#[cfg(windows)]
mod win {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Graphics::Printing::*;

    fn largo(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    unsafe fn texto(p: *const u16) -> String {
        if p.is_null() {
            return String::new();
        }
        let mut n = 0usize;
        while *p.add(n) != 0 {
            n += 1;
        }
        String::from_utf16_lossy(std::slice::from_raw_parts(p, n))
    }

    pub fn listar() -> Result<Vec<String>, String> {
        unsafe {
            let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
            let mut necessario: u32 = 0;
            let mut quantidade: u32 = 0;
            EnumPrintersW(flags, null(), 4, null_mut(), 0, &mut necessario, &mut quantidade);
            if necessario == 0 {
                return Ok(Vec::new());
            }
            // Buffer alinhado para as estruturas com ponteiros.
            let mut buffer = vec![0u64; (necessario as usize + 7) / 8];
            if EnumPrintersW(flags, null(), 4, buffer.as_mut_ptr() as *mut u8, necessario, &mut necessario, &mut quantidade) == 0 {
                return Err("Não foi possível listar as impressoras.".into());
            }
            let itens = std::slice::from_raw_parts(buffer.as_ptr() as *const PRINTER_INFO_4W, quantidade as usize);
            let mut nomes: Vec<String> = itens.iter().map(|i| texto(i.pPrinterName)).filter(|n| !n.is_empty()).collect();
            nomes.sort();
            Ok(nomes)
        }
    }

    pub fn imprimir(nome: &str, dados: &[u8]) -> Result<(), String> {
        unsafe {
            let nome_largo = largo(nome);
            let mut h = std::mem::zeroed();
            if OpenPrinterW(nome_largo.as_ptr(), &mut h, null()) == 0 {
                return Err(format!("Não foi possível abrir a impressora \"{nome}\"."));
            }
            let mut documento = largo("RoVibes");
            let mut tipo = largo("RAW");
            let info = DOC_INFO_1W { pDocName: documento.as_mut_ptr(), pOutputFile: null_mut(), pDatatype: tipo.as_mut_ptr() };
            if StartDocPrinterW(h, 1, &info as *const DOC_INFO_1W as _) == 0 {
                ClosePrinter(h);
                return Err("A impressora não aceitou o documento.".into());
            }
            StartPagePrinter(h);
            let mut escritos: u32 = 0;
            let ok = WritePrinter(h, dados.as_ptr() as _, dados.len() as u32, &mut escritos);
            EndPagePrinter(h);
            EndDocPrinter(h);
            ClosePrinter(h);
            if ok == 0 || escritos as usize != dados.len() {
                return Err("A impressão não foi concluída. Confira se a impressora está ligada.".into());
            }
            Ok(())
        }
    }
}

#[cfg(windows)]
pub use win::{imprimir, listar};

#[cfg(not(windows))]
pub fn listar() -> Result<Vec<String>, String> {
    Ok(Vec::new())
}

#[cfg(not(windows))]
pub fn imprimir(_nome: &str, _dados: &[u8]) -> Result<(), String> {
    Err("Impressão direta disponível só no Windows.".into())
}
