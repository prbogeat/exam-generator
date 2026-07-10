#!/usr/bin/env python3
import json
import urllib.request
import urllib.error

API_BASE = "http://localhost:9000/api"

def test_api(method, path, data=None, token=None):
    """Test API endpoint"""
    url = f"{API_BASE}{path}"
    headers = {
        "Content-Type": "application/json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    try:
        if data:
            req = urllib.request.Request(
                url, 
                data=json.dumps(data).encode(),
                headers=headers,
                method=method
            )
        else:
            req = urllib.request.Request(url, headers=headers, method=method)
        
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode()
            print(f"✓ {method} {path} => {resp.status}")
            if body:
                result = json.loads(body)
                return result
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"✗ {method} {path} => {e.code}")
        if body:
            print(f"  Error: {body}")
        return None

print("=== Test Subscription API ===\n")

# Test 1: Health check
print("1. Health check")
test_api("GET", "/health")

# Test 2: Register
print("\n2. Register user")
reg_data = {
    "name": "Test User",
    "email": f"test{__import__('time').time_ns()}@example.com",
    "password": "TestPassword123"
}
reg_resp = test_api("POST", "/auth/register", data=reg_data)
if reg_resp:
    token = reg_resp.get("token")
    print(f"  Token: {token[:20]}...")  # Show first 20 chars
else:
    print("  Failed to register, stopping tests")
    exit(1)

# Test 3: Load catalog
print("\n3. Load catalog")
cat_resp = test_api("GET", "/catalog", token=token)
if cat_resp:
    items = cat_resp.get("items", [])
    print(f"  Found {len(items)} exams")
    if items:
        sample = items[0]
        print(f"  Sample: {sample.get('examTitle')} (UID: {sample.get('examUid')})")
        exam_uid = sample.get("examUid")
    else:
        print("  No exams found in catalog")
        exam_uid = None
else:
    print("  Failed to load catalog")
    exam_uid = None

# Test 4: Get user profile
print("\n4. Get user profile")
test_api("GET", "/auth/me", token=token)

# Test 5: Load history (empty)
print("\n5. Load history")
test_api("GET", "/account/progress", token=token)

# Test 6: Load favorites (empty)
print("\n6. Load favorites")
test_api("GET", "/account/favorites", token=token)

# Test 7: Save progress (if we have an exam)
if exam_uid:
    print(f"\n7. Save progress for exam {exam_uid}")
    progress_data = {
        "exam_uid": exam_uid,
        "exam_title": "Test Exam",
        "subject": "Test Subject",
        "answers": {"q1": "a", "q2": "b"},
        "score": 50.0
    }
    test_api("POST", "/account/progress", data=progress_data, token=token)

    # Test 8: Load that progress back
    print(f"\n8. Load saved progress")
    test_api("GET", f"/account/progress-detail?exam_uid={exam_uid}", token=token)

    # Test 9: Save favorite
    print(f"\n9. Save as favorite")
    fav_data = {
        "exam_uid": exam_uid,
        "exam_title": "Test Exam",
        "subject": "Test Subject",
        "partial": None,
        "file": None
    }
    test_api("POST", "/account/favorites", data=fav_data, token=token)

    # Test 10: Load favorites
    print(f"\n10. Load favorites")
    fav_resp = test_api("GET", "/account/favorites", token=token)
    if fav_resp:
        items = fav_resp.get("items", [])
        print(f"  Found {len(items)} favorite(s)")

print("\n✅ All tests completed!\n")
