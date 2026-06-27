# Web-Based To-Do List Application

This project is a simple full-stack to-do app built with Flask, HTML, CSS, JavaScript, and optional MongoDB storage.

## Features
- Add tasks
- Mark tasks as complete
- Delete tasks
- In-memory fallback when MongoDB is not configured

## Setup
1. Create and activate a virtual environment.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Optionally set a MongoDB connection string in `.env`:
   ```env
   MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/
   ```
4. Run the app:
   ```bash
   python app.py
   ```
5. Open http://127.0.0.1:5000/

## Testing
```bash
python -m unittest discover -s tests -v
```
