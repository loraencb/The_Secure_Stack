LABS = {
    "juice-shop-recon": {
        "name": "Juice Shop Recon Lab",
        "description": "Basic reconnaissance against an exposed web application.",
        "attacker": {
            "image": "securestack-attacker:latest",
            "container_name": "attacker-{session_id}",
        },
        "target": {
            "image": "bkimminich/juice-shop",
            "container_name": "target-{session_id}",
            "ports": {"3000/tcp": None},
            "app_port": 3000,
            "alias": "target",
        },
        "steps": [
            {
                "title": "Verify connectivity",
                "instruction": "Confirm the attacker can reach the target container.",
                "command_hint": "ping -c 3 target",
                "step_type": "command",
            },
            {
                "title": "Identify open services",
                "instruction": "Scan the target to discover open ports and services.",
                "command_hint": "nmap -sV target",
                "step_type": "command",
            },
            {
                "title": "Inspect the web application",
                "instruction": "Fetch the application response from the target.",
                "command_hint": "curl http://target:3000",
                "step_type": "command",
            },
            {
                "title": "Open the application",
                "instruction": "Open the target in your browser.",
                "command_hint": "http://localhost:{target_port}",
                "step_type": "browser",
            },
        ],
    }
}
