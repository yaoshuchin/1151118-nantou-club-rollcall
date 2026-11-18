import openpyxl
import json
import re

wb = openpyxl.load_workbook('南投國中115學年度_各社團點名單1116.xlsx', data_only=True)

# 1. Parse presidents sheet
ws_pres = wb['社長']
presidents_data = {}
for r in range(1, 13):
    cname = ws_pres.cell(r, 2).value
    if not cname:
        continue
    cname = str(cname).strip()
    officers = []
    # cols: 3=班級, 4=座號, 5=姓名 | 6=班級, 7=座號, 8=姓名 | 9=班級, 10=座號, 11=姓名
    for offset in [3, 6, 9]:
        cls = ws_pres.cell(r, offset).value
        seat = ws_pres.cell(r, offset + 1).value
        name = ws_pres.cell(r, offset + 2).value
        if cls or seat or name:
            officers.append({
                'class': str(cls).strip() if cls else '',
                'seat': str(seat).strip() if seat else '',
                'name': str(name).strip() if name else ''
            })
    presidents_data[cname] = officers

def parse_info(info_str):
    teacher = ''
    location = ''
    fee = '無'
    time_info = '週二第7-8節'
    if not info_str:
        return teacher, location, fee, time_info
    
    m_t = re.search(r'指導教師[:：]\s*([^\s]+)', info_str)
    if m_t:
        teacher = m_t.group(1)
    
    m_l = re.search(r'地點[:：]\s*([^\s]+)', info_str)
    if m_l:
        location = m_l.group(1)
    
    m_f = re.search(r'費用[:：]\s*([^\s]+)', info_str)
    if m_f:
        fee = m_f.group(1)
    
    return teacher, location, fee, time_info

clubs = []

club_ids = {
    '程式設計社': 'prog',
    '柔道社': 'judo',
    '舞蹈社': 'dance',
    '魔術氣球社': 'magic',
    '桌遊團康社': 'boardgame',
    '自媒體創意社': 'media',
    '羽球社': 'badminton',
    '匹克球社': 'pickleball',
    '桌球社': 'tabletennis',
    '拔河社': 'tugofwar',
    '國樂社': 'chinese_orch',
    '口琴社': 'harmonica',
    '工作表1': 'orch_band'
}

# Standard Tuesday semester dates
tuesday_dates = [
    '2026-10-06',
    '2026-10-13',
    '2026-10-20',
    '2026-10-27',
    '2026-11-03',
    '2026-11-10',
    '2026-11-17',
    '2026-11-24',
    '2026-12-01',
    '2026-12-08',
    '2026-12-15',
    '2026-12-22',
    '2026-12-29',
    '2027-01-05',
    '2027-01-12'
]

sept_dates = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29']

target_sheets = [s for s in wb.sheetnames if s != '社長']

for sname in target_sheets:
    ws = wb[sname]
    disp_name = sname
    if sname == '工作表1':
        disp_name = '國樂團(集訓/校隊)'
    cid = club_ids.get(sname, f'club_{len(clubs)+1}')
    
    info_str = ws.cell(2, 1).value or ''
    teacher, location, fee, time_info = parse_info(str(info_str))
    
    officers = []
    for k, v in presidents_data.items():
        if k in sname or sname.startswith(k[:2]):
            officers = v
            break
            
    students = []
    for r in range(5, ws.max_row + 1):
        num = ws.cell(r, 1).value
        cls = ws.cell(r, 2).value
        seat = ws.cell(r, 3).value
        name = ws.cell(r, 4).value
        gender = ws.cell(r, 5).value
        if not name or not str(name).strip():
            continue
        
        name_str = str(name).strip()
        cls_str = str(cls).strip() if cls is not None else ''
        seat_str = str(seat).strip() if seat is not None else ''
        gender_str = str(gender).strip() if gender is not None else ''
        
        role = ''
        for idx, off in enumerate(officers):
            match_by_name = (off.get('name') and off.get('name') == name_str)
            match_by_seat = (off.get('class') == cls_str and off.get('seat') == seat_str and not off.get('name'))
            if match_by_name or match_by_seat:
                if idx == 0:
                    role = '社長'
                elif idx == 1:
                    role = '副社長'
                else:
                    role = '幹部'
                if not off.get('name'):
                    off['name'] = name_str
                break
                
        # Parse initial attendance from original excel columns
        init_attendance = {}
        curr_dates = sept_dates if sname == '工作表1' else tuesday_dates[:5]
        for c_idx, d_str in enumerate(curr_dates):
            col = 6 + c_idx * 3
            p7 = ws.cell(r, col).value
            p8 = ws.cell(r, col + 1).value
            note = ws.cell(r, col + 2).value
            init_attendance[d_str] = {
                'p7': str(p7).strip() if p7 is not None and str(p7).strip() else 'O',
                'p8': str(p8).strip() if p8 is not None and str(p8).strip() else 'O',
                'note': str(note).strip() if note is not None and str(note).strip() else ''
            }
            
        students.append({
            'num': num if num is not None else len(students) + 1,
            'class': cls_str,
            'seat': seat_str,
            'name': name_str,
            'gender': gender_str,
            'role': role,
            'attendance': init_attendance
        })
        
    club_obj = {
        'id': cid,
        'originalSheet': sname,
        'name': disp_name,
        'teacher': teacher,
        'location': location,
        'fee': fee,
        'timeInfo': time_info,
        'officers': [o for o in officers if o.get('name') or o.get('seat')],
        'studentCount': len(students),
        'students': students,
        'activeDates': sept_dates if sname == '工作表1' else tuesday_dates
    }
    clubs.append(club_obj)

output_data = {
    'school': '南投縣立南投國民中學',
    'academicYear': '115學年度',
    'semester': '第一學期',
    'updatedAt': '2026-11-18',
    'tuesdayDates': tuesday_dates,
    'clubs': clubs
}

with open('data/clubs_data.json', 'w', encoding='utf-8') as f:
    json.dump(output_data, f, ensure_ascii=False, indent=2)

print('Successfully exported data/clubs_data.json!')
print(f'Total clubs: {len(clubs)}')
for c in clubs:
    officer_names = [o.get('name') for o in c['officers'] if o.get('name')]
    print(f"- {c['name']}: {c['studentCount']} 人, 教師: {c['teacher']}, 地點: {c['location']}, 費用: {c['fee']}, 幹部: {officer_names}")
