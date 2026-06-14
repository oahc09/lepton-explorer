use std::fs::File;
use std::io::Write;
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

const XML_HEAD: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>"#;

/// Create a file at `path` with content appropriate to its extension. Text-like
/// types are empty; .rtf gets a minimal header; .docx/.xlsx/.pptx get a minimal
/// but valid Office Open XML package (opens cleanly in Word/Excel/PowerPoint).
pub fn create_typed_file(path: &str) -> std::io::Result<()> {
    let p = Path::new(path);
    let ext = p.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).unwrap_or_default();
    match ext.as_str() {
        "docx" => create_docx(p),
        "xlsx" => create_xlsx(p),
        "pptx" => create_pptx(p),
        "rtf" => std::fs::write(p, r"{\rtf1\ansi\ansicpg1252\deff0}"),
        _ => std::fs::write(p, ""), // txt, md, csv, json, html, xml, log, …
    }
}

fn put(zip: &mut ZipWriter<File>, name: &str, body: &str, opts: SimpleFileOptions) -> std::io::Result<()> {
    zip.start_file(name, opts)?;
    zip.write_all(body.as_bytes())
}

fn create_docx(path: &Path) -> std::io::Result<()> {
    let mut z = ZipWriter::new(File::create(path)?);
    let o = SimpleFileOptions::default();
    put(&mut z, "[Content_Types].xml", &format!("{XML_HEAD}\n<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>"), o)?;
    put(&mut z, "_rels/.rels", &format!("{XML_HEAD}\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>"), o)?;
    put(&mut z, "word/document.xml", &format!("{XML_HEAD}\n<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p/></w:body></w:document>"), o)?;
    z.finish()?;
    Ok(())
}

fn create_xlsx(path: &Path) -> std::io::Result<()> {
    let mut z = ZipWriter::new(File::create(path)?);
    let o = SimpleFileOptions::default();
    put(&mut z, "[Content_Types].xml", &format!("{XML_HEAD}\n<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/></Types>"), o)?;
    put(&mut z, "_rels/.rels", &format!("{XML_HEAD}\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>"), o)?;
    put(&mut z, "xl/workbook.xml", &format!("{XML_HEAD}\n<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"Sheet1\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>"), o)?;
    put(&mut z, "xl/_rels/workbook.xml.rels", &format!("{XML_HEAD}\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>"), o)?;
    put(&mut z, "xl/worksheets/sheet1.xml", &format!("{XML_HEAD}\n<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData/></worksheet>"), o)?;
    z.finish()?;
    Ok(())
}

fn create_pptx(path: &Path) -> std::io::Result<()> {
    let mut z = ZipWriter::new(File::create(path)?);
    let o = SimpleFileOptions::default();
    put(&mut z, "[Content_Types].xml", &format!("{XML_HEAD}\n<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/ppt/presentation.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml\"/><Override PartName=\"/ppt/slides/slide1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slide+xml\"/></Types>"), o)?;
    put(&mut z, "_rels/.rels", &format!("{XML_HEAD}\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"ppt/presentation.xml\"/></Relationships>"), o)?;
    put(&mut z, "ppt/presentation.xml", &format!("{XML_HEAD}\n<p:presentation xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\"><sldIdLst><sldId id=\"256\" r:id=\"rId1\"/></sldIdLst></p:presentation>"), o)?;
    put(&mut z, "ppt/_rels/presentation.xml.rels", &format!("{XML_HEAD}\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide\" Target=\"slides/slide1.xml\"/></Relationships>"), o)?;
    put(&mut z, "ppt/slides/slide1.xml", &format!("{XML_HEAD}\n<p:sld xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\"><cSld><spTree><nvGrpSpPr><cNvPr id=\"1\" name=\"\"/><cNvGrpSpPr/><grpSpPr/></nvGrpSpPr></spTree></cSld></p:sld>"), o)?;
    z.finish()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn creates_text_file_empty() {
        let d = tempdir().unwrap();
        let p = d.path().join("a.txt");
        create_typed_file(p.to_str().unwrap()).unwrap();
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "");
    }

    #[test]
    fn creates_rtf_with_header() {
        let d = tempdir().unwrap();
        let p = d.path().join("a.rtf");
        create_typed_file(p.to_str().unwrap()).unwrap();
        assert!(std::fs::read_to_string(&p).unwrap().starts_with("{\\rtf1"));
    }

    #[test]
    fn creates_valid_docx_zip() {
        let d = tempdir().unwrap();
        let p = d.path().join("a.docx");
        create_typed_file(p.to_str().unwrap()).unwrap();
        // A .docx is a ZIP; its first two bytes are "PK".
        let bytes = std::fs::read(&p).unwrap();
        assert!(&bytes[..2] == b"PK", "docx should be a ZIP archive");
        assert!(bytes.len() > 200);
    }

    #[test]
    fn creates_valid_xlsx_and_pptx_zips() {
        let d = tempdir().unwrap();
        for ext in ["xlsx", "pptx"] {
            let p = d.path().join(format!("a.{ext}"));
            create_typed_file(p.to_str().unwrap()).unwrap();
            let bytes = std::fs::read(&p).unwrap();
            assert!(&bytes[..2] == b"PK", "{ext} should be a ZIP archive");
        }
    }
}
