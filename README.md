# InciCare Capstone

## What is InciCare?

InciCare is an intelligent incident management application designed to help users process, classify, and monitor operational incidents.

The application uses AI to analyse incoming incident information, assign an appropriate severity level, calculate the required response time, and display incidents through the monitoring dashboard.

The main purpose of this project is to reduce manual incident classification and make it easier for users to identify and respond to important incidents.

---

## Features

InciCare provides the following main features:

* AI-based incident classification
* Three incident severity levels: Critical, Medium, and Low
* SLA countdown for incidents
* Real-time incident updates
* Incident location detection
* Critical incident notifications
* Duplicate incident detection

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
```

### Backend

The `backend` folder contains the Python backend application.

```text
backend/
├── app.py
└── requirements.txt
```

* `app.py` — main backend application
* `requirements.txt` — Python dependencies required by the backend

The backend uses Flask, Flask-CORS, Flask-SocketIO, Eventlet, and Requests.

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

* **Python 3.11.x (recommended)**
* Git
* Ollama
* The Python packages listed in `backend/requirements.txt`

> **Recommended Python version:** Python **3.11.x**.

Python 3.11 is recommended for this project because the backend uses Flask, Flask-SocketIO, Eventlet, Flask-CORS, and Requests.

You do **not** need to install each Python package manually.

---

# Quick Start on Windows

Follow the steps below to download and run InciCare on a Windows computer.

## 1. Install Python 3.11

Download **Python 3.11 for Windows** from the official Python website:

[Python 3.11 Downloads](https://www.python.org/downloads/release/python-3119/?utm_source=chatgpt.com)

For most Windows computers, download:

```text
Windows installer (64-bit)
```

During installation, make sure to enable:

```text
Add python.exe to PATH
```

Then click:

```text
Install Now
```

### Check Python Installation

After installation, open **PowerShell** or **Command Prompt** and run:

```powershell
python --version
```

You should see something similar to:

```text
Python 3.11.x
```

For example:

```text
Python 3.11.9
```

Also check pip:

```powershell
python -m pip --version
```

If both commands display a version number, Python has been installed successfully.

### If Python is Not Recognized

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

If neither `python` nor `py` works, reinstall Python 3.11 and make sure **Add python.exe to PATH** is selected.

> **Important:** Do not install Python 2. InciCare requires Python 3. Python **3.11.x** is the recommended version.

---

## 2. Install Git

Download and install Git for Windows:

[Git for Windows](https://git-scm.com/download/win?utm_source=chatgpt.com)

After installation, check:

```powershell
git --version
```

You should see a Git version number.

---

## 3. Download the Project

Open **PowerShell** or **Command Prompt**.

Clone the GitHub repository:

```powershell
git clone https://github.com/bowenliu770-pixel/InciCare_Capstone
```

Then enter the project folder:

```powershell
cd InciCare_Capstone\Incident
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

This automatically installs the required Python packages for the backend.

The current requirements include:

```text
flask==3.0.0
flask-cors==4.0.0
flask-socketio==5.3.6
eventlet==0.35.1
requests==2.31.0
```

After installation, remain inside the `backend` folder for the next step.

---

## 5. Install Ollama

InciCare uses **Ollama** to run the AI model locally.

Download and install Ollama for Windows:

[Ollama Download](https://ollama.com/download?utm_source=chatgpt.com)

After installation, open a new PowerShell or Command Prompt window and check:

```powershell
ollama --version
```

If a version number is displayed, Ollama has been installed successfully.

InciCare connects to the local Ollama service at:

```text
http://localhost:11434/api/generate
```

The application uses Ollama for local AI-based incident classification.

---

## 6. Download the AI Model

InciCare's default AI model is:

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

The application is configured to use `qwen2.5:3b` as its default model.

### Optional Fallback Model

InciCare can automatically escalate uncertain classifications to a larger model.

The configured fallback model is:

```text
qwen2.5:7b
```

If you want to enable the fallback model, run:

```powershell
ollama pull qwen2.5:7b
```

Then check again:

```powershell
ollama list
```

You should see:

```text
qwen2.5:3b
qwen2.5:7b
```

The application is configured to use `qwen2.5:7b` when the smaller model produces a low-confidence result.

---

# 7. Run InciCare

Make sure you are inside the `backend` folder:

```powershell
cd InciCare_Capstone\InciCare\backend
```

Then run:

```powershell
python app.py
```

If you are using the Python launcher instead:

```powershell
py app.py
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
Install Python 3.11
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
(Optional) Download qwen2.5:7b
      ↓
Run app.py
      ↓
Open Browser
      ↓
InciCare is Ready
```

---

# Main Commands

If Python, Git, and Ollama are already installed:

```powershell
git clone https://github.com/bowenliu770-pixel/InciCare_Capstone

cd InciCare_Capstone

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

Then open the local URL shown in the terminal.

---

# Troubleshooting

## Python is Not Recognized

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

If neither `python` nor `py` works, reinstall **Python 3.11** and make sure **Add python.exe to PATH** is selected during installation.

---

## Python Version is Different

Check your version:

```powershell
python --version
```

Recommended:

```text
Python 3.11.x
```

If you are using a different Python version and encounter package or application errors, install Python 3.11 and use it to run the project.

---

## `requirements.txt` Cannot Be Found

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

## Ollama is Not Recognized

If you see:

```text
'ollama' is not recognized
```

make sure Ollama has been installed correctly.

Download Ollama from:

[Ollama Download](https://ollama.com/download?utm_source=chatgpt.com)

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

If the fallback model is being used, make sure this is also installed:

```powershell
ollama pull qwen2.5:7b
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

InciCare's backend sends classification requests to the local Ollama API.

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

## Port Already in Use

If the application cannot start because the port is already being used, check whether another instance of InciCare is already running.

Close the existing InciCare terminal or stop the previous Python process before running:

```powershell
python app.py
```

again.

---

# How InciCare Classifies Incidents

InciCare uses a multi-stage classification process.

```text
Incoming Incident
        ↓
Regex Triage
        ↓
Is the incident obvious?
   ↙             ↘
 YES              NO
 ↓                 ↓
Classify       Ollama AI
Directly       Classification
                  ↓
             Confidence Check
                  ↓
          Is confidence low?
             ↙          ↘
           YES           NO
            ↓             ↓
      qwen2.5:7b      Final Result
            ↓
       Final Result
```

## The backend first uses deterministic regex-based triage for obvious incidents. Ambiguous incidents are sent to the local Ollama model for semantic classification. Low-confidence results can then be escalated to the larger fallback model.

# Incident Severity Levels

InciCare uses three incident severity levels:

| Tier   | Severity | SLA        | Description                                                            |
| ------ | -------- | ---------- | ---------------------------------------------------------------------- |
| Tier 1 | Critical | 8 minutes  | Major operational impact requiring immediate attention                 |
| Tier 2 | Medium   | 40 minutes | Degraded service or potential threat requiring investigation           |
| Tier 3 | Low      | 4 hours    | Routine or informational incident with no immediate operational impact |

The application's classification prompt defines Tier 1 as critical service failures, Tier 2 as degraded services or potential threats, and Tier 3 as routine or informational incidents.

---

# Location Detection

InciCare can detect locations mentioned in incident information.

Examples include:

```text
Singapore
London
Frankfurt
Punggol
eu-west-1
ap-southeast-1
SIN
529538
```

The system includes geographic location detection for cities, countries, cloud regions, airport codes, Singapore postal codes, and other recognised locations.

---

# Real-Time Monitoring

The backend uses Flask-SocketIO to support real-time communication with the frontend.

This allows the monitoring interface to receive incident updates without requiring the user to manually refresh the page.

The application configures SocketIO using threading mode:

```python
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading"
)
```

---

# Important Notes

## Keep the Terminal Open

When running:

```powershell
python app.py
```

do not close the terminal.

The application will stop when the process is terminated.

---

## Internet Connection

An internet connection is required for:

* Downloading the GitHub repository
* Installing Python packages
* Downloading Ollama
* Downloading the AI model

After the AI model has been downloaded, InciCare performs its AI classification locally through Ollama.

---

## Ollama

Ollama is required because InciCare uses a locally running AI model for incident classification.

The default model is:

```text
qwen2.5:3b
```

The fallback model is:

```text
qwen2.5:7b
```

---

## Private Credentials

**Do not upload passwords, API keys, tokens, or other private credentials to GitHub.**

If external notification services are configured, make sure their credentials are stored securely using environment variables or another secure configuration method.

Before publishing the project publicly, check `app.py` and remove any credentials that may have been included during development.

---

# InciCare Capstone

**Project:** InciCare Capstone

**System:** Intelligent Incident Management & Multi-Tiered Alerting System

InciCare focuses on automatically processing operational incidents, classifying their severity, monitoring SLA deadlines, and helping users respond to important incidents efficiently.

---

## Running InciCare in One Look

If Python 3.11, Git, and Ollama are already installed:

```powershell
git clone https://github.com/bowenliu770-pixel/InciCare_Capstone

cd InciCare

cd backend

python -m pip install -r requirements.txt

ollama pull qwen2.5:3b

python app.py
```

Optional fallback model:

```powershell
ollama pull qwen2.5:7b
```

Then open the local URL shown in the terminal.

**InciCare should now be running on your computer.**
