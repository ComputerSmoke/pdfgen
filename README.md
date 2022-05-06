# pdfgen
Hosts a site which takes user uploaded zip files, and searches their subdirectories for pdfs and java files.
The java files are converted to PDF, and all pdfs are merged. This massive PDF is then returned to the 
user, and uploaded to a google drive repository.

# Setup

1. Put a google drive API key named apiKey.json in the base directory
2. install wkhtmltopdf
3. Change folderId to point to upload google drive folder
