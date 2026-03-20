# Course Management System - CPE107L-1-Final-Project-Foxtrot-Batch (Windows & macOS)

Welcome, classmates! This guide will walk you through the steps to set up your environment, clone this repository from GitHub, and get ready to contribute to the project. These instructions are specifically for Windows and macOS.

## Prerequisites

Before you begin, make sure you have the following installed on your computer:

*   **Git:** Git is a version control system that helps you track changes to your code and collaborate with others.
*   **Node.js and npm (Node Package Manager):** This project is built with Node.js, so you'll need it to run the code and install dependencies.
*   **Postman (Optional, but Recommended):** Postman is a tool for testing API endpoints. It will be helpful for testing the different modules of this project. Download it from [https://www.postman.com/downloads/](https://www.postman.com/downloads/)

## Step 1: Install Git

If you don't already have Git installed, follow these instructions for your operating system:

*   **Windows:**
    1.  Download Git for Windows from [https://git-scm.com/download/win](https://git-scm.com/download/win)
    2.  Run the installer. Use the default options for most settings, but you might want to choose your preferred text editor during the installation process. **Important:** Make sure you choose the option to "Use Git from Git Bash only" or "Git from the command line and also from 3rd-party software". This allows you to use Git commands in the next steps.
*   **macOS:**
    1.  If you have Homebrew installed, open your terminal and run: `brew install git`
    2.  Alternatively, you can download Git for macOS from [https://git-scm.com/download/mac](https://git-scm.com/download/mac) and run the installer.

After installing Git, open a terminal or command prompt (Git Bash on Windows) and run `git --version` to verify that it's installed correctly. You should see the Git version number.

## Step 2: Create a GitHub Account

If you don't already have a GitHub account, follow these instructions:

1.  Go to [https://github.com/join](https://github.com/join)
2.  Enter a username, email address, and password.
3.  Follow the instructions to verify your email address.

## Step 3: Clone the Repository

To get a copy of the project files onto your computer, you need to "clone" the repository from GitHub. Follow these instructions:

1.  **Get the Repository URL:** Go to the GitHub page for this project (ask Vince Lawrence for the link if you don't have it). Click the green "Code" button. Copy the URL (either the HTTPS or SSH URL).
HTTPS: https://github.com/ye-long-dragon/CPE107L-1-Final-Project-Foxtrot-Batch.git

2.  **Open a Terminal (macOS) or Git Bash (Windows):**

    *   **What is a Terminal?** A terminal (macOS) or Git Bash (Windows) is a command-line interface (CLI) – a way to interact with your computer using text-based commands. It's like a text-based remote control for your computer.

3.  **Basic Terminal Commands:**

    *   **`cd` (change directory):** Navigates to a different folder on your computer. For example, `cd Documents/Projects` will move you into the "Projects" folder inside your "Documents" folder.
    *   **`ls` (list):** (macOS & Linux) Displays a list of files and folders in the current directory.
    *   **`dir` (directory):** (Windows) Does the same as `ls`, displays the files and folders in the current directory.

4.  **Navigate to a Directory:** Use the `cd` command to navigate to the directory where you want to store the project files. For example:

    ```bash
    cd Documents/Projects
    ```

5.  **Clone the Repository:** Run the following command, replacing `[repository URL]` with the URL you copied:

    ```bash
    git clone https://github.com/ye-long-dragon/CPE107L-1-Final-Project-Foxtrot-Batch.git
    ```

    This will create a new directory with the same name as the repository, containing all the project files.

## Step 4: Install Dependencies

This project uses Node.js and npm. Navigate into the project directory (the one that was created when you cloned the repository) and install the dependencies:

```bash
cd CMS  
npm install dotenv
npm install ejs
npm install express
npm install express-session
npm install mongodb
npm install mongoose
npm install nodemon -D
```


## Step 5: Adding a .env
When using the project, ensure that you must create a .env file that will contain the following information

```.env
MAINPAGESPORT=8100
ATAPORT=8200
SYLLABUSPORT=8300
TLAPORT=8400
TWAPORT=8500
```

This is to ensure that any additional changes made will only require your own server to startup and not any other server will be affected

## Step 6: Starting Servers
Whenever you start your own server, ensure that you open your terminal and input the code "node File/servername"

Here are some examples:
```Starting Servers
node ATA/ataServer.js  # Runs the ATA module
node MainPages/mainPagesServer.js  # Runs the ATA module
node syllabus/syllabusServer.js  # Runs the ATA module
node TLA/tlaServer.js  # Runs the ATA module
node tws/twsServer.js  # Runs the ATA module

## Import TWS Subjects From PDF

If you have a PDF list of courses and you only want to import course code + title to the TWS Subject database, run:

```bash
npm run import:tws:pdf -- --file "path/to/your-courses.pdf" --department CEA --program CpE
```

Notes:
- The script parses course code/title pairs from PDF text.
- Existing course codes are updated with the latest title.
- New records are inserted with defaults for fields not in the PDF (`units`, `department`, `program`).
- To preview without writing to DB, add `--dry-run`.

Example dry run:

```bash
npm run import:tws:pdf -- --file "path/to/your-courses.pdf" --dry-run
```

