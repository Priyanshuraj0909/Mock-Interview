"""One-time cleanup of the synthetic account from the failed 0.3.0 smoke run."""
from datetime import datetime, timezone

MIGRATION = '0.3.0-abandoned-smoke-account'

async def cleanup_abandoned_smoke_account(db):
    if await db['maintenance'].find_one({'_id': MIGRATION}):
        return
    # Only the reserved example.com smoke-account pattern and exact attempt window.
    # This excludes ordinary accounts and every later verification run.
    query = {'name': 'Release verification', 'purpose': 'Deployment verification',
             'email': {'$regex': r'^release-[0-9a-f]{16}@example\.com$'},
             'created_at': {'$gte': datetime(2026, 11, 1, 7, 39, tzinfo=timezone.utc),
                            '$lt': datetime(2026, 11, 1, 7, 42, 27, tzinfo=timezone.utc)}}
    async for user in db['users'].find(query):
        user_id = str(user['_id'])
        await db['users'].update_one({'_id': user['_id']}, {'$set': {'deleting': True}, '$inc': {'tokenVersion': 1}})
        await db['sessions'].delete_many({'userId': user_id})
        await db['refresh_tokens'].delete_many({'userId': user_id})
        await db['users'].delete_many({'_id': user['_id']})
    await db['maintenance'].find_one_and_update({'_id': MIGRATION}, {'$set': {'complete': True}}, upsert=True)
