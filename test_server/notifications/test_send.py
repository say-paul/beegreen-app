#!/usr/bin/env python3
"""
Test script to manually send a notification via FCM.
Run this to verify Firebase is working correctly.

Usage:
    python -m test_server.notifications.test_send
"""
from . import fcm_service

def main():
    print("=" * 50)
    print("Testing FCM Notification")
    print("=" * 50)
    
    try:
        print("\nSending test notification to 'pump_events' topic...")
        result = fcm_service.send_to_topic('pump_start', device_id='TEST_DEVICE')
        print(f"\n✓ SUCCESS! Message ID: {result}")
        print("\nIf your app is subscribed to 'pump_events' topic,")
        print("you should receive a 'Pump Started' notification now.")
    except Exception as e:
        print(f"\n✗ FAILED: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()
