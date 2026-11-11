
import getpass
import json
import urllib.request
import urllib.error
import http.cookiejar

BASE_URL = "http://127.0.0.1:8000"

cookies = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(cookies)
)

try:
    # Step 1: Get the CSRF token
    with opener.open(f"{BASE_URL}/api/csrf/") as response:
        csrf_data = json.loads(response.read().decode())
        csrf_token = csrf_data["csrfToken"]

    print("CSRF endpoint: OK")

    # Step 2: Ask for login credentials
    username = input("Enter your LMS username: ").strip()
    password = getpass.getpass("Enter your LMS password: ")

    payload = json.dumps({
        "username": username,
        "password": password,
    }).encode()

    request = urllib.request.Request(
        f"{BASE_URL}/api/login/",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "X-CSRFToken": csrf_token,
            "Referer": f"{BASE_URL}/",
        },
        method="POST",
    )

    # Step 3: Send the login request
    with opener.open(request) as response:
        result = json.loads(response.read().decode())

        print("Login HTTP status:", response.status)
        print(json.dumps(result, indent=2))

        session_exists = any(
            cookie.name == "sessionid"
            for cookie in cookies
        )
        print("Session cookie received:", session_exists)

except urllib.error.HTTPError as error:
    print("HTTP status:", error.code)
    print("Response:", error.read().decode())

except Exception as error:
    print("Error:", error)
