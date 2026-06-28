export type MaskCategory =
  | "amount"
  | "phone"
  | "email"
  | "name"
  | "customer_name"
  | "business_number"
  | "address"
  | "title"
  | "generic";

const NAME_POOL = [
  "김민서", "이지훈", "박서연", "최도윤", "정하은",
  "강시우", "윤서아", "임주원", "한지유", "송예준",
  "조은채", "신민준", "백수아", "오태민", "권나윤",
  "황건우", "안소율", "서지호", "류지안", "노예린",
  "배준서", "남채원", "문서윤", "홍지웅", "유다은",
  "전현우", "고지원", "양시현", "손하린", "곽지환",
  "표서진", "장유나", "진하준", "차예린", "구민재",
  "우서영", "마지호", "설윤서", "함도현", "변지율",
  "추하영", "도시안", "위재현", "명지원", "라은우",
  "모지훈", "사윤하", "어준영", "인서후", "천하늘",
];

const COMPANY_POOL = [
  "한빛테크", "미래소프트", "아이콘랩", "별빛전자", "누리정보",
  "다빛코퍼레이션", "가람컴퍼니", "새벽시스템즈", "한길솔루션", "푸른미디어",
  "솔잎디자인", "마루스튜디오", "보람산업", "햇살무역", "동행이노베이션",
  "라온파트너스", "다온데이터", "늘봄텍", "새빛홀딩스", "한울씨앤씨",
  "밝음컨설팅", "미르엔지니어링", "슬기로운랩", "차오름", "다온그룹",
  "한솔커뮤니케이션", "별꽃에이전시", "한가람물류", "다인테크놀로지", "새한무역",
  "길동상사", "강산유통", "빛고을산업", "한겨레식품", "봄날제조",
  "푸른솔", "한들엔터", "윤슬바이오", "가온트래블", "다솜에듀",
  "우리경영연구소", "새로미디어", "한별패션", "다나스튜디오", "마음건축",
  "누리꿈", "한솔모빌리티", "가람금속", "솔빛에너지", "한결케어",
];

const ADDRESS_POOL = [
  "서울특별시 강남구 테헤란로 152",
  "서울특별시 서초구 강남대로 411",
  "경기도 성남시 분당구 판교역로 235",
  "서울특별시 마포구 와우산로 94",
  "서울특별시 종로구 종로 1",
  "부산광역시 해운대구 센텀중앙로 90",
  "인천광역시 연수구 송도과학로 32",
  "대전광역시 유성구 대학로 99",
  "대구광역시 수성구 동대구로 100",
  "광주광역시 서구 상무중앙로 80",
  "경기도 수원시 영통구 광교중앙로 250",
  "경기도 고양시 일산동구 호수로 596",
  "서울특별시 영등포구 여의대로 24",
  "서울특별시 송파구 올림픽로 300",
  "서울특별시 강동구 천호대로 1077",
  "경기도 안양시 동안구 시민대로 235",
  "경기도 용인시 수지구 풍덕천로 100",
  "충청남도 천안시 동남구 만남로 43",
  "강원도 춘천시 중앙로 1",
  "경상남도 창원시 의창구 중앙대로 151",
  "전라북도 전주시 완산구 효자로 225",
  "전라남도 여수시 시청로 1",
  "제주특별자치도 제주시 첨단로 213",
  "울산광역시 남구 중앙로 201",
  "세종특별자치시 도움5로 20",
  "경기도 화성시 동탄대로 537",
  "경기도 평택시 평남로 1029",
  "경상북도 포항시 남구 지곡로 80",
  "충청북도 청주시 흥덕구 직지대로 410",
  "경기도 김포시 김포한강9로 76",
];

const TITLE_POOL = [
  "신규 프로젝트 검토", "월간 보고서 작성", "클라이언트 미팅 준비", "분기 예산 검토",
  "마케팅 전략 회의", "제품 출시 일정 조율", "인사 평가 진행", "계약서 검토",
  "부서 워크숍 기획", "기술 세미나 참석", "협력사 방문", "신입사원 교육",
  "고객 만족도 조사", "시장 동향 분석", "매출 분석 리포트", "디자인 시안 검토",
  "개발 일정 조율", "인테리어 견적 확인", "행사 진행 준비", "채용 면접",
  "매뉴얼 업데이트", "사내 공지사항 정리", "신제품 기획 회의", "영업 실적 보고",
  "재고 관리 회의", "인프라 점검", "보안 정책 수립", "데이터 백업 확인",
  "사용자 피드백 정리", "광고 캠페인 기획", "콘텐츠 검수", "SNS 운영 회의",
  "협업 도구 점검", "출장 일정 조율", "거래처 미팅", "결산 회의",
  "세금 신고 준비", "자산 점검", "회의실 예약 정리", "임원 회의 자료 준비",
  "신규 채용 공고", "인사이동 검토", "복리후생 점검", "사옥 이전 검토",
  "외주 발주 검토", "시스템 점검", "교육 자료 작성", "비품 발주",
  "견적서 작성", "일정표 정리",
];

function hash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickFromPool<T>(pool: T[], input: string): T {
  return pool[hash(input) % pool.length];
}

function replaceDigits(input: string, seed: string, preserveLeading: number = 0): string {
  const rng = mulberry32(hash(seed));
  let idx = 0;
  return input.replace(/\d/g, (d) => {
    const current = idx++;
    if (current < preserveLeading) return d;
    return String(Math.floor(rng() * 10));
  });
}

function maskAmount(input: string): string {
  return replaceDigits(input, input);
}

function maskPhone(input: string): string {
  return replaceDigits(input, input, 3);
}

function maskBusinessNumber(input: string): string {
  return replaceDigits(input, input);
}

function maskEmail(_input: string): string {
  return "sample@example.com";
}

function maskName(input: string): string {
  return pickFromPool(NAME_POOL, input);
}

function maskCustomerName(input: string): string {
  return pickFromPool(COMPANY_POOL, input);
}

function maskAddress(input: string): string {
  return pickFromPool(ADDRESS_POOL, input);
}

function maskTitle(input: string): string {
  return pickFromPool(TITLE_POOL, input);
}

function maskGeneric(input: string): string {
  return pickFromPool(TITLE_POOL, input);
}

export function mask(
  category: MaskCategory,
  input: string | number | null | undefined,
  enabled: boolean
): string {
  if (input == null) return "";
  const str = typeof input === "number" ? String(input) : input;
  if (!enabled) return str;
  if (str.length === 0) return str;

  switch (category) {
    case "amount":
      return maskAmount(str);
    case "phone":
      return maskPhone(str);
    case "email":
      return maskEmail(str);
    case "name":
      return maskName(str);
    case "customer_name":
      return maskCustomerName(str);
    case "business_number":
      return maskBusinessNumber(str);
    case "address":
      return maskAddress(str);
    case "title":
      return maskTitle(str);
    case "generic":
    default:
      return maskGeneric(str);
  }
}
