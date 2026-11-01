import copy
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def nested(document, key):
    value = document
    for part in key.split('.'):
        if not isinstance(value, dict) or part not in value:
            return None
        value = value[part]
    return value


def matches(document, query):
    for key, expected in query.items():
        if key == '$or':
            if not any(matches(document, item) for item in expected):
                return False
            continue
        actual = nested(document, key)
        if isinstance(expected, dict):
            for operation, value in expected.items():
                if operation == '$exists' and (actual is not None) != value:
                    return False
                if operation not in {'$exists', '$lt'}:
                    raise AssertionError(f'Unsupported test query operator: {operation}')
                if operation == '$lt' and (actual is None or actual >= value):
                    return False
        elif actual != expected:
            return False
    return True


class MemoryCursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, key, direction):
        self.documents.sort(key=lambda doc: doc[key], reverse=direction < 0)
        return self

    def limit(self, limit):
        self.documents = self.documents[:limit]
        return self

    def __aiter__(self):
        self.iterator = iter(self.documents)
        return self

    async def __anext__(self):
        try:
            return copy.deepcopy(next(self.iterator))
        except StopIteration:
            raise StopAsyncIteration


class MemoryCollection:
    def __init__(self):
        self.documents = []

    async def insert_one(self, document):
        from bson import ObjectId
        document.setdefault('_id', ObjectId())
        self.documents.append(copy.deepcopy(document))
        return SimpleNamespace(inserted_id=document['_id'])

    async def find_one(self, query):
        return copy.deepcopy(next((doc for doc in self.documents if matches(doc, query)), None))

    def find(self, query, projection=None):
        return MemoryCursor([copy.deepcopy(doc) for doc in self.documents if matches(doc, query)])

    async def find_one_and_update(self, query, update, upsert=False, return_document=None):
        document = next((doc for doc in self.documents if matches(doc, query)), None)
        inserted = document is None
        if document is None:
            if not upsert:
                return None
            document = {key: value for key, value in query.items() if not key.startswith('$')}
            self.documents.append(document)
        for key, value in update.get('$set', {}).items():
            document[key] = copy.deepcopy(value)
        for key, value in update.get('$inc', {}).items():
            document[key] = document.get(key, 0) + value
        for key in update.get('$unset', {}):
            document.pop(key, None)
        if inserted:
            document.update(copy.deepcopy(update.get('$setOnInsert', {})))
        return copy.deepcopy(document)

    async def delete_many(self, query):
        before = len(self.documents)
        self.documents = [doc for doc in self.documents if not matches(doc, query)]
        return SimpleNamespace(deleted_count=before - len(self.documents))

    async def find_one_and_delete(self, query):
        document = next((doc for doc in self.documents if matches(doc, query)), None)
        if document is not None:
            self.documents.remove(document)
        return copy.deepcopy(document)

    async def update_one(self, query, update):
        result = await self.find_one_and_update(query, update)
        return SimpleNamespace(matched_count=int(result is not None))


class MemoryDatabase(dict):
    def __missing__(self, key):
        self[key] = MemoryCollection()
        return self[key]


@pytest.fixture
def database(monkeypatch):
    from database import get_database
    from main import app
    from routers import auth
    db = MemoryDatabase()
    monkeypatch.setattr(auth, 'SECRET_KEY', 'test-only-secret-' * 4)
    app.dependency_overrides[get_database] = lambda: db
    yield db
    app.dependency_overrides.clear()


@pytest.fixture
def signed_in(database):
    from bson import ObjectId
    from routers import auth
    user_id = ObjectId()
    database['users'].documents.append({'_id': user_id, 'email': 'person@example.com'})
    return {'Authorization': f'Bearer {auth._create_access_token({"sub": str(user_id)})}'}
