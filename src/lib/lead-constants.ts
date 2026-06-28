export const LEAD_TYPES = ['개발', '교육'] as const;

export const LEAD_STATUSES = ['신규', '상담중', '견적발송', '계약완료', '실패', '보류'] as const;

export const LEAD_SOURCES = ['폼문의', '전화', '이메일', '소개', '기타'] as const;

export const REFERRAL_SOURCES = [
  '검색 (네이버/구글)',
  '회사 홈페이지',
  '지인 소개',
  'SNS (인스타그램/페이스북/스레드/링크드인)',
  '블로그/카페',
  '유튜브',
  '광고를 보고',
  '기타',
] as const;

export const INDUSTRIES = [
  '제조/생산',
  '유통/물류',
  '금융/보험/자산관리',
  'IT/소프트웨어',
  '서비스업 (청소, 배달, 중개 등)',
  '세무/회계/법률',
  '공공기관/교육',
  '기타',
] as const;

export const AUTOMATION_AREAS = [
  'CS/고객응대 자동화',
  '정산/회계 업무',
  '데이터 수집/정리',
  '보고서 자동 생성',
  '배정/스케줄링',
  '메시지 발송 (카카오톡, 이메일 등)',
  'ERP/CRM 연동',
  '기타',
] as const;

export const BUDGETS = [
  '500만원 미만',
  '500만원 ~ 2,000만원',
  '2,000만원 ~ 5,000만원',
  '5,000만원 이상',
  '아직 정해지지 않음',
] as const;

export const TIMELINES = [
  '즉시 (1주 내)',
  '1개월 내',
  '3개월 내',
  '아직 미정 / 정보 수집 중',
] as const;

export const EDU_DELIVERY_MODES = ['온라인', '오프라인', '혼합'] as const;

export const LEAD_TYPE_COLORS: Record<string, string> = {
  '개발': 'bg-indigo-100 text-indigo-800',
  '교육': 'bg-orange-100 text-orange-800',
};

export const LEAD_STATUS_COLORS: Record<string, string> = {
  '신규': 'bg-blue-100 text-blue-800',
  '상담중': 'bg-yellow-100 text-yellow-800',
  '견적발송': 'bg-purple-100 text-purple-800',
  '계약완료': 'bg-green-100 text-green-800',
  '실패': 'bg-red-100 text-red-800',
  '보류': 'bg-gray-100 text-gray-800',
};
