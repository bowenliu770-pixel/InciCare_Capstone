````markdown
# InciCare Capstone

## What is InciCare?

InciCare is an intelligent incident management application designed to help users process, classify, and monitor operational incidents.

The application uses AI to analyse incoming incident information, assign an appropriate severity level, calculate the required response time, and display incidents through the monitoring dashboard.

The main purpose of this project is to reduce manual incident classification and make it easier for users to identify and respond to important incidents.

---

## Features

InciCare provides the following main features:

- AI-based incident classification
- Three incident severity levels: Critical, Medium, and Low
- SLA countdown for incidents
- Real-time incident updates
- Incident location detection
- Critical incident notifications
- Duplicate incident detection

---

# Project Structure

The project is organised into three main folders:

```text
InciCare/
│
├── backend/
│   ├── app.py
│   └── requirements.txt
│
├── frontend/
│   ├── *.html
│   ├── *.js
│   └── *.css
│
├── data/
│   └── ...
│
└── README.md
````

### Backend

The `backend` folder contains the Python backend application.

```text
backend/
├── app.py
└── requirements.txt
```

* `app.py` — main backend application
* `requirements.txt` — Python dependencies required by the backend

### Frontend

The `frontend` folder contains the user interface.

```text
frontend/
├── HTML files
├── JavaScript files
└── CSS files
```

### Data

The `data` folder contains the application's local data.

---

# Requirements

Before running InciCare on Windows, please install:

* Python 3
* Git
* Ollama
* The Python packages listed in `backend/requirements.txt`

You do **not** need to install each Python package manually.

---

# Quick Start on Windows

Follow the steps below to download and run InciCare on a Windows computer.

## 1. Install Python

Download and install Python from:

[https://www.python.org/downloads/](https://www.python.org/downloads/)

During installation, make sure to enable:

```text
Add Python to PATH
```

After installation, open **PowerShell** or **Command Prompt** and check:

```powershell
python --version
```

You should see a Python 3 version.

Also check pip:

```powershell
python -m pip --version
```

---

## 2. Install Git

Download and install Git for Windows:

[https://git-scm.com/download/win](https://git-scm.com/download/win)

After installation, check:

```powershell
git --version
```

---

## 3. Download the Project

Open **PowerShell** or **Command Prompt**.

Clone the GitHub repository:

```powershell
git clone https://github.com/bowenliu770-pixel/InciCare_Capstone
```

Then enter the project folder:

```powershell
cd InciCare
```

> Replace `InciCare` with the actual repository folder name if it is different.

---

## 4. Install the Required Python Packages

The Python dependencies are located inside the `backend` folder.

Enter the backend folder:

```powershell
cd backend
```

Then install all required packages:

```powershell
python -m pip install -r requirements.txt
```

This automatically installs all Python packages required by the backend.

After installation, you should remain inside the `backend` folder for the next step.

---

## 5. Install Ollama

InciCare uses **Ollama** to run the AI model locally.

Download and install Ollama for Windows:

[https://ollama.com/download](https://ollama.com/download)

After installation, open a new PowerShell or Command Prompt window and check:

```powershell
ollama --version
```

If a version number is displayed, Ollama has been installed successfully.

---

## 6. Download the AI Model

InciCare uses:

```text
qwen2.5:3b
```

Download the model:

```powershell
ollama pull qwen2.5:3b
```

After the download is complete, check the installed models:

```powershell
ollama list
```

You should see:

```text
qwen2.5:3b
```

### Optional Fallback Model

If the project configuration requires the larger fallback model, also run:

```powershell
ollama pull qwen2.5:7b
```

Then check again:

```powershell
ollama list
```

---

# 7. Run InciCare

Make sure you are inside the `backend` folder:

```powershell
cd backend
```

Then run:

```powershell
python app.py
```

The backend application will start.

**Keep this terminal window open while using InciCare.**

---

# 8. Open the Application

After running:

```powershell
python app.py
```

the terminal will display the local address used by the application.

Open that address in your web browser.

For example:

```text
http://127.0.0.1:5000
```

or:

```text
http://localhost:5000
```

> Use the exact address displayed in the terminal if the port is different.

Once the page opens, InciCare is ready to use.

---

# Quick Installation Summary

For a new Windows computer:

```text
Install Python
      ↓
Install Git
      ↓
Clone GitHub Repository
      ↓
Enter InciCare Folder
      ↓
Enter backend Folder
      ↓
Install requirements.txt
      ↓
Install Ollama
      ↓
Download qwen2.5:3b
      ↓
Run app.py
      ↓
Open Browser
      ↓
InciCare is Ready
```

### Main Commands

```powershell
git clone <YOUR-GITHUB-REPOSITORY-URL>

cd InciCare

cd backend

python -m pip install -r requirements.txt

ollama pull qwen2.5:3b

python app.py
```

If the larger fallback model is required:

```powershell
ollama pull qwen2.5:7b
```

---

# Troubleshooting

## Python is not recognized

If you see:

```text
'python' is not recognized as an internal or external command
```

try:

```powershell
py --version
```

If `py` works, use:

```powershell
py -m pip install -r requirements.txt
```

and:

```powershell
py app.py
```

If neither `python` nor `py` works, reinstall Python and make sure **Add Python to PATH** is selected.

---

## `requirements.txt` cannot be found

Make sure you are inside the `backend` folder.

Check your current location:

```powershell
dir
```

You should see:

```text
app.py
requirements.txt
```

If you are still in the main project folder, run:

```powershell
cd backend
```

Then:

```powershell
python -m pip install -r requirements.txt
```

---

## Ollama is not recognized

If you see:

```text
'ollama' is not recognized
```

make sure Ollama has been installed correctly.

Download Ollama from:

[https://ollama.com/download](https://ollama.com/download)

After installation, restart PowerShell or Command Prompt and run:

```powershell
ollama --version
```

---

## AI Model Cannot Be Found

Check the installed models:

```powershell
ollama list
```

If `qwen2.5:3b` is not listed, run:

```powershell
ollama pull qwen2.5:3b
```

Then check again:

```powershell
ollama list
```

---

## InciCare Cannot Connect to Ollama

Make sure Ollama is installed and available.

Check:

```powershell
ollama --version
```

Then:

```powershell
ollama list
```

Make sure `qwen2.5:3b` is installed.

After that, run the backend again:

```powershell
python app.py
```

---

## The Application Does Not Start

Make sure you are inside the backend folder:

```powershell
cd InciCare
cd backend
```

Then reinstall the dependencies:

```powershell
python -m pip install -r requirements.txt
```

Then run:

```powershell
python app.py
```

If an error appears in the terminal, check the error message for information about the missing package or configuration problem.

---

# Important Notes

### Keep the Terminal Open

When running:

```powershell
python app.py
```

do not close the terminal.

The application will stop when the process is terminated.

### Internet Connection

An internet connection is required for:

* Downloading the GitHub repository
* Installing Python packages
* Downloading Ollama
* Downloading the AI model

### Ollama

Ollama is required because InciCare uses a locally running AI model for incident classification.

### Private Credentials

Do not upload passwords, API keys, tokens, or other private credentials to GitHub.

If external notification services are configured, make sure their credentials are stored securely.

---

# InciCare Capstone

**Project:** InciCare Capstone

**System:** Intelligent Incident Management & Multi-Tiered Alerting System

InciCare focuses on automatically processing operational incidents, classifying their severity, monitoring SLA deadlines, and helping users respond to important incidents efficiently.

---

## Running InciCare in One Look

If Python, Git, and Ollama are already installed:

```powershell
git clone <YOUR-GITHUB-REPOSITORY-URL>

cd InciCare

cd backend

python -m pip install -r requirements.txt

ollama pull qwen2.5:3b

python app.py
```

Then open the local URL shown in the terminal.

**InciCare should now be running on your computer.**

````
