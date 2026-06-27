import unittest

from app import InMemoryTaskStore, create_app


class TodoAppTests(unittest.TestCase):
    def setUp(self):
        self.store = InMemoryTaskStore()
        self.app = create_app(store=self.store)
        self.client = self.app.test_client()

    def test_crud_flow(self):
        response = self.client.post("/api/tasks", json={"task": "Write tests"})
        self.assertEqual(response.status_code, 201)

        payload = response.get_json()
        self.assertEqual(payload["task"], "Write tests")
        self.assertFalse(payload["completed"])
        task_id = payload["id"]

        list_response = self.client.get("/api/tasks")
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.get_json()["tasks"]), 1)

        update_response = self.client.patch(
            f"/api/tasks/{task_id}", json={"completed": True}
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertTrue(update_response.get_json()["completed"])

        delete_response = self.client.delete(f"/api/tasks/{task_id}")
        self.assertEqual(delete_response.status_code, 200)
        self.assertTrue(delete_response.get_json()["deleted"])

    def test_priority_and_filtering(self):
        first = self.client.post(
            "/api/tasks", json={"task": "Alpha task", "priority": "High"}
        ).get_json()
        self.client.post(
            "/api/tasks", json={"task": "Beta task", "priority": "Low"}
        )
        self.client.patch(f"/api/tasks/{first['id']}", json={"completed": True})

        active_response = self.client.get(
            "/api/tasks", query_string={"filter": "active", "search": "alpha"}
        )
        self.assertEqual(active_response.status_code, 200)
        self.assertEqual(len(active_response.get_json()["tasks"]), 0)

        completed_response = self.client.get(
            "/api/tasks", query_string={"filter": "completed"}
        )
        self.assertEqual(completed_response.status_code, 200)
        self.assertEqual(len(completed_response.get_json()["tasks"]), 1)
        self.assertEqual(completed_response.get_json()["tasks"][0]["priority"], "High")


if __name__ == "__main__":
    unittest.main()
