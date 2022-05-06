const express = require('express');
const app = express();
const rateLimit = require("express-rate-limit");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const multer = require("multer");
const unzipper = require("unzipper");
const { deflateSync } = require('zlib');
const hljs = require("highlight.js");
const { getSystemErrorMap } = require('util');
const path = require("path");
var escape = require('escape-html');
let pdf = require("wkhtmltopdf");
const del = require("del");
const PDFMerger = require('pdf-merger-js');
const {google} = require("googleapis");

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, './uploads')
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
      cb(null, file.fieldname + '-' + uniqueSuffix)
    }
  })
const upload = multer({storage, limits: {fileSize: 500 * 1000 * 1000}})

const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, 
    max: 200 
});

const pdfOptions = {format: "A4"}

app.use(express.urlencoded({extended: true}));
app.use(express.json());
app.use(express.static('./client'));
app.use(limiter);

app.listen(2000);
console.log("Server started.");

app.post("/upload", upload.single("file"), async(req, res) => {
    let teamName = req.body.name;
    //Extract zip file
    const extractedPath = "./extracted/"+req.file.filename;
    await new Promise(res => {
        fs.createReadStream(req.file.path).pipe(
            unzipper.Extract({path: extractedPath})
        ).promise().then(res);
    });
    //DFS uploaded directory and append .java contents to text and HTML files
    const outputPath = "./output/"+req.file.filename;
    fs.mkdirSync(outputPath);
    const textPath = outputPath + "/plaintext.txt";
    const htmlPath = outputPath + "/highlighting.html";
    const bwHtmlPath = outputPath + "/bw.html";
    const pdfPath = outputPath + "/"+teamName+".pdf";
    fs.writeFileSync(htmlPath, "<!DOCTYPE html><head><style>"+style()+"</style></head><body>");
    fs.writeFileSync(bwHtmlPath, "<!DOCTYPE html><body>");
    let merger = new PDFMerger();
    dfs(extractedPath, textPath, htmlPath, bwHtmlPath, merger);
    fs.appendFileSync(htmlPath, "<script>"+script()+"</script><script>hljs.highlightAll();</script></body></html>");
    fs.appendFileSync(bwHtmlPath, "</body></html>");
    await generatePdf(bwHtmlPath, pdfPath);
    merger.add(pdfPath);
    await merger.save(pdfPath);

    //Delete temporary folders
    await del(req.file.path);
    await del(extractedPath);

    await uploadToDrive(pdfPath)

    res.sendFile(path.join(__dirname, pdfPath.substring(2)));
});

async function generatePdf(htmlPath, pdfPath) {
    let contents = fs.readFileSync(htmlPath, "utf8");
    await new Promise(res => {
        pdf(contents, {output: pdfPath, noPdfCompression: true, grayscale: false}, res);
    });
}

function dfs(path, saveDir, htmlPath, bwHtmlPath, merger) {
    let files = fs.readdirSync(path);
    //Search for java files
    for(let i = 0; i < files.length; i++) {
        let file = files[i];
        let filePath = path+"/"+file
        try {
            if(file.endsWith(".java")) addContents(filePath, saveDir, htmlPath, bwHtmlPath);
            else if(file.endsWith(".pdf")) merger.add(filePath);
        } catch(e) {
            console.error(e);
        }

    }
    //Search subdirectories
    for(let i = 0; i < files.length; i++) {
        let file = files[i];
        let filePath = path+"/"+file
        if(fs.lstatSync(filePath).isDirectory()) dfs(filePath, saveDir, htmlPath, bwHtmlPath, merger);
    }
}
//Append contents of file to saveDir
function addContents(filePath, saveDir, htmlPath, bwHtmlPath) {
    let contents = fs.readFileSync(filePath, "utf8");
    let name = getName(filePath);
    let toWrite = name + "\n\n" + contents + "\n\n\n";
    let toWriteHtml = "<h2>"+escape(name)+"</h2>" + "<pre><code class=\"language-java\">" + escape(contents) + "</code></pre>";
    let toWriteBw = "<h2>"+escape(name)+"</h2>" + "<pre style=\"font: 25px Monospace\">" + escape(contents) + "</pre>";
    fs.appendFileSync(saveDir, toWrite);
    fs.appendFileSync(htmlPath, toWriteHtml);
    fs.appendFileSync(bwHtmlPath, toWriteBw);
}

//Get name of path to file (removing extra folders created during upload)
function getName(path) {
    let out = "";
    let split = path.split("/");
    for(let i = 3; i < split.length; i++) {
        out += split[i];
        if(i < split.length-1) out += "/";
    }
    return out;
}

function style() {
    return fs.readFileSync("./client/default-dark.min.css");
}
function script() {
    return fs.readFileSync("./client/highlight.min.js");
}

async function uploadToDrive(filePath) {
    let split = filePath.split("/");
    let fileName = split[split.length-1];
    const folderId = '1D7z07TTh6eRUSS-Gw0jRscCMT7qKYI9Q';
    const { data: { id, name } = {} } = await (getDriveService().files.create({
      resource: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType: 'application/pdf',
        body: fs.createReadStream(filePath),
      },
      fields: 'id,name',
    }));
    console.log('File Uploaded', name, id);
}


const getDriveService = () => {
    const KEYFILEPATH = path.join(__dirname, 'apiKey.json');
    const SCOPES = ['https://www.googleapis.com/auth/drive'];
  
    const auth = new google.auth.GoogleAuth({
      keyFile: KEYFILEPATH,
      scopes: SCOPES,
    });
    const driveService = google.drive({ version: 'v3', auth });
    return driveService;
  };