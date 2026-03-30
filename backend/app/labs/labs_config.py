LABS = {
    "juice-shop-recon": {
        "id": "juice-shop-recon",
        "name": "Juice Shop Recon Lab",
        "description": "Introductory web reconnaissance against an exposed Juice Shop target in a controlled classroom lab.",
        "category": "web",
        "difficulty": "beginner",
        "estimated_time_minutes": 45,
        "learning_objectives": [
            "Verify connectivity to a target in an isolated lab network.",
            "Identify exposed services using basic reconnaissance techniques.",
            "Inspect a web application from both the attacker container and the browser.",
            "Recognize information worth documenting as an initial finding.",
        ],
        "attacker": {
            "image": "securestack-attacker:latest",
            "container_name": "attacker-{session_id}",
        },
        "target": {
            "image": "bkimminich/juice-shop",
            "container_name": "target-{session_id}",
            "ports": {"3000/tcp": None},
            "browser_port": "3000/tcp",
            "alias": "target",
        },
        "steps": [
            {
                "step_id": 1,
                "title": "Verify connectivity",
                "instruction": "Confirm that the attacker container can reach the target container across the isolated lab network.",
                "command_hint": "ping -c 3 target",
                "expected_outcome": "The target responds to network traffic from the attacker container.",
            },
            {
                "step_id": 2,
                "title": "Identify open services",
                "instruction": "Scan the target to discover exposed ports and identify the running service.",
                "command_hint": "nmap -sV target",
                "expected_outcome": "You identify at least one open port and determine that a web service is exposed.",
            },
            {
                "step_id": 3,
                "title": "Inspect the web application",
                "instruction": "Request the application from the attacker container to confirm that the service is reachable internally.",
                "command_hint": "curl http://target:3000",
                "expected_outcome": "You receive a response from the Juice Shop application.",
            },
            {
                "step_id": 4,
                "title": "Open the application in the browser",
                "instruction": "Use the browser URL provided by the backend to inspect the application from the host system.",
                "command_hint": "Open the browser_url returned when the lab launches.",
                "expected_outcome": "The Juice Shop interface loads in the browser.",
            },
        ],
        "student_manual": {
            "enabled": False,
            "path": "labs/juice-shop-recon/student_manual.md",
        },
        "instructor_guide": {
            "enabled": False,
            "path": "labs/juice-shop-recon/instructor_guide.md",
        },
    }
}