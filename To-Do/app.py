import os
from datetime import datetime
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

try:
    from pymongo import MongoClient
except ImportError:  # pragma: no cover - optional dependency for tests
    MongoClient = None

load_dotenv()


class InMemoryTaskStore:
    def __init__(self) -> None:
        self._tasks: List[Dict[str, Any]] = []
        self._next_id = 1

    def list_tasks(self) -> List[Dict[str, Any]]:
        return list(self._tasks)

    def create_task(self, task_text: str, priority: Optional[str] = None) -> Dict[str, Any]:
        task = {
            "id": str(self._next_id),
            "task": task_text,
            "completed": False,
            "priority": priority or "Medium",
            "created_at": datetime.utcnow().isoformat(),
        }
        self._tasks.append(task)
        self._next_id += 1
        return task

    def update_task(self, task_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        for task in self._tasks:
            if task["id"] == task_id:
                task.update(updates)
                return task
        return None

    def delete_task(self, task_id: str) -> bool:
        for index, task in enumerate(self._tasks):
            if task["id"] == task_id:
                del self._tasks[index]
                return True
        return False


class MongoTaskStore:
    def __init__(
        self,
        mongo_uri: str,
        db_name: Optional[str] = None,
        collection_name: Optional[str] = None,
    ) -> None:
        if MongoClient is None:
            raise RuntimeError("pymongo is not installed")

        self.client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        self.database = self.client[db_name or os.getenv("MONGO_DB_NAME", "todo_db")]
        self.collection = self.database[
            collection_name or os.getenv("MONGO_COLLECTION_NAME", "tasks")
        ]

        try:
            self.client.admin.command("ping")
        except Exception as exc:
            raise RuntimeError(f"Unable to connect to MongoDB: {exc}") from exc

        self.collection.create_index("id", unique=True)
        self.collection.create_index("created_at")

    def list_tasks(self) -> List[Dict[str, Any]]:
        tasks = list(self.collection.find({}, {"_id": 0}).sort("created_at", -1))
        return tasks

    def create_task(self, task_text: str, priority: Optional[str] = None) -> Dict[str, Any]:
        task = {
            "id": self._new_id(),
            "task": task_text,
            "completed": False,
            "priority": priority or "Medium",
            "created_at": datetime.utcnow().isoformat(),
        }
        self.collection.insert_one(task)
        return self._strip_id(task)

    def update_task(self, task_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        result = self.collection.find_one_and_update(
            {"id": task_id},
            {"$set": updates},
            return_document=True,
            projection={"_id": 0},
        )
        return self._strip_id(result) if result is not None else None

    def delete_task(self, task_id: str) -> bool:
        result = self.collection.delete_one({"id": task_id})
        return result.deleted_count > 0

    @staticmethod
    def _strip_id(task: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if task is None:
            return None
        if "_id" in task:
            task = dict(task)
            task.pop("_id", None)
        return task

    @staticmethod
    def _new_id() -> str:
        return str(datetime.utcnow().timestamp()).replace(".", "")


def create_store() -> Any:
    mongo_uri = (
        os.getenv("MONGO_URI")
        or os.getenv("MONGODB_URI")
        or os.getenv("MONGODB_URL", "")
    ).strip()
    if mongo_uri:
        try:
            db_name = os.getenv("MONGO_DB_NAME", "todo_db")
            collection_name = os.getenv("MONGO_COLLECTION_NAME", "tasks")
            return MongoTaskStore(mongo_uri, db_name=db_name, collection_name=collection_name)
        except Exception as exc:
            print(f"MongoDB unavailable, falling back to in-memory store: {exc}")
            return InMemoryTaskStore()
    return InMemoryTaskStore()


def create_app(store: Optional[Any] = None) -> Flask:
    app = Flask(__name__)
    app.config["JSON_SORT_KEYS"] = False

    task_store = store or create_store()

    @app.route("/")
    def index() -> str:
        return render_template("index.html")

    @app.route("/api/tasks", methods=["GET"])
    def list_tasks():
        tasks = task_store.list_tasks()
        filter_name = (request.args.get("filter") or "all").lower()
        search = (request.args.get("search") or "").strip().lower()

        filtered_tasks: List[Dict[str, Any]] = []
        for task in tasks:
            completed = bool(task.get("completed", False))
            if filter_name == "active" and completed:
                continue
            if filter_name == "completed" and not completed:
                continue
            if search and search not in str(task.get("task", "")).lower():
                continue
            filtered_tasks.append(task)

        return jsonify({"tasks": filtered_tasks})

    @app.route("/api/tasks", methods=["POST"])
    def create_task():
        data = request.get_json(silent=True) or {}
        task_text = (data.get("task") or "").strip()
        if not task_text:
            return jsonify({"error": "Task is required"}), 400

        priority = str(data.get("priority") or "").strip() or None
        task = task_store.create_task(task_text, priority)
        return jsonify(task), 201

    @app.route("/api/tasks/<task_id>", methods=["PATCH"])
    def update_task(task_id: str):
        data = request.get_json(silent=True) or {}
        updates = {}
        if "completed" in data:
            updates["completed"] = bool(data["completed"])
        if "task" in data:
            task_text = str(data["task"]).strip()
            if task_text:
                updates["task"] = task_text
        if "priority" in data:
            priority = str(data["priority"]).strip()
            if priority:
                updates["priority"] = priority
        if not updates:
            return jsonify({"error": "No valid fields provided"}), 400

        task = task_store.update_task(task_id, updates)
        if task is None:
            return jsonify({"error": "Task not found"}), 404
        return jsonify(task)

    @app.route("/api/tasks/<task_id>", methods=["DELETE"])
    def delete_task(task_id: str):
        deleted = task_store.delete_task(task_id)
        if deleted:
            return jsonify({"deleted": True})
        return jsonify({"deleted": False, "error": "Task not found"}), 404

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True)
