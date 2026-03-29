LABS = {
    "juice-shop": {
        "name": "OWASP Juice Shop Lab",
        "description": "Practice web application reconnaissance and basic vulnerability discovery.",
        "attacker": {
            "image": "ubuntu:22.04",
            "container_name": "attacker-{session_id}",
        },
        "target": {
            "image": "bkimminich/juice-shop",
            "container_name": "target-{session_id}",
            "ports": {"3000/tcp": None},  # auto assign
        },
        "steps": [
            {
                "title": "Verify network access",
                "instruction": "Check connectivity to the target container.",
                "command_hint": "ping target",
            },
            {
                "title": "Discover open ports",
                "instruction": "Identify open ports on the target.",
                "command_hint": "nmap target",
            },
            {
                "title": "Access web application",
                "instruction": "Open the Juice Shop from the attacker container.",
                "command_hint": "curl http://target:3000"
            },
        ],
    }
}