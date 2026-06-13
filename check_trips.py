import sqlite3
conn = sqlite3.connect('app.db')
cursor = conn.cursor()

cursor.execute('SELECT COUNT(*) FROM trips')
total = cursor.fetchone()[0]
print(f'Total trips: {total}')

cursor.execute('SELECT id, status, driver_id FROM trips ORDER BY id DESC LIMIT 10')
print('\nLast 10 trips:')
for row in cursor.fetchall():
    driver = row[2] or 'None'
    print(f'  ID {row[0]}: {row[1]} - Driver: {driver}')

conn.close()
