/* generate_navigation_packs.js
   Generates navigation_{lang}.js files from existing content packs and lesson data.
   Usage: node scripts/generate_navigation_packs.js
   Output: data/i18n_content/navigation_{ko,my,vi,th,fr,zh}.js */
(function () {
  "use strict";

  var fs = require("fs");
  var path = require("path");
  var ROOT = path.resolve(__dirname, "..");
  var OUT_DIR = path.join(ROOT, "data", "i18n_content");

  /* ─── Chapter name translations (manually prepared) ─── */
  var CHAPTER_TRANSLATIONS = {
    sql: {
      ko: {
        "1. 关系型数据库与SQL入门": "1. 관계형 데이터베이스와 SQL 입문",
        "2. 数据检索核心 (SELECT)": "2. 데이터 검색 핵심 (SELECT)",
        "3. SQL 函数与高级数据变换": "3. SQL 함수와 고급 데이터 변환",
        "4. 关联查询与子查询": "4. 조인 조회와 서브쿼리",
        "5. 数据修改与表管理": "5. 데이터 수정과 테이블 관리"
      },
      zh: {
        "1. 关系型数据库与SQL入门": "1. 关系型数据库与SQL入门",
        "2. 数据检索核心 (SELECT)": "2. 数据检索核心 (SELECT)",
        "3. SQL 函数与高级数据变换": "3. SQL 函数与高级数据变换",
        "4. 关联查询与子查询": "4. 关联查询与子查询",
        "5. 数据修改与表管理": "5. 数据修改与表管理"
      },
      my: {
        "1. 关系型数据库与SQL入门": "1. ဆက်စပ်ဒေတာဘေ့စ်နှင့် SQL မိတ်ဆက်",
        "2. 数据检索核心 (SELECT)": "2. ဒေတာရှာဖွေရေး အဓိက (SELECT)",
        "3. SQL 函数与高级数据变换": "3. SQL ဖန်ရှင်များနှင့် အဆင့်မြင့် ဒေတာပြောင်းလဲခြင်း",
        "4. 关联查询与子查询": "4. ဆက်စပ်မေးခွန်းနှင့် Subquery",
        "5. 数据修改与表管理": "5. ဒေတာပြင်ဆင်ခြင်းနှင့် ဇယားစီမံခန့်ခွဲမှု"
      },
      vi: {
        "1. 关系型数据库与SQL入门": "1. Nhập môn CSDL quan hệ và SQL",
        "2. 数据检索核心 (SELECT)": "2. Truy xuất dữ liệu cốt lõi (SELECT)",
        "3. SQL 函数与高级数据变换": "3. Hàm SQL và biến đổi dữ liệu nâng cao",
        "4. 关联查询与子查询": "4. Truy vấn kết hợp và truy vấn con",
        "5. 数据修改与表管理": "5. Sửa đổi dữ liệu và quản lý bảng"
      },
      th: {
        "1. 关系型数据库与SQL入门": "1. แนะนำฐานข้อมูลเชิงสัมพันธ์และ SQL",
        "2. 数据检索核心 (SELECT)": "2. หลักการค้นหาข้อมูล (SELECT)",
        "3. SQL 函数与高级数据变换": "3. ฟังก์ชัน SQL และการแปลงข้อมูลขั้นสูง",
        "4. 关联查询与子查询": "4. การเชื่อมโยงและซับเควอรี",
        "5. 数据修改与表管理": "5. การแก้ไขข้อมูลและการจัดการตาราง"
      },
      fr: {
        "1. 关系型数据库与SQL入门": "1. Introduction aux bases de données relationnelles et SQL",
        "2. 数据检索核心 (SELECT)": "2. Recherche de données essentielle (SELECT)",
        "3. SQL 函数与高级数据变换": "3. Fonctions SQL et transformation avancée",
        "4. 关联查询与子查询": "4. Jointures et sous-requêtes",
        "5. 数据修改与表管理": "5. Modification des données et gestion des tables"
      }
    },
    java: {
      ko: {
        "第1章 Java言語に触れる": "제1장 Java 언어 체험하기",
        "第2章 Java言語の基本": "제2장 Java 언어의 기초",
        "第3章 条件分岐と繰り返し": "제3장 조건 분기와 반복",
        "第4章 メソッド": "제4장 메서드",
        "第5章 クラスの基本": "제5장 클래스의 기초",
        "第6章 クラスの一歩進んだ使い方": "제6장 클래스 심화 활용",
        "第7章 継承": "제7장 상속",
        "第8章 抽象クラスとインタフェース": "제8장 추상 클래스와 인터페이스",
        "実践編 第1章 パッケージとJava API": "실전편 제1장 패키지와 Java API",
        "実践編 第2章 例外処理": "실전편 제2장 예외 처리",
        "実践編 第3章 スレッド": "실전편 제3장 스레드",
        "実践編 第4章 GCとメモリ管理": "실전편 제4장 GC와 메모리 관리",
        "実践編 第5章 コレクション": "실전편 제5장 컬렉션",
        "実践編 第6章 ラムダ式": "실전편 제6장 람다식",
        "実践編 第7章 入出力（I/O）": "실전편 제7장 입출력(I/O)",
        "実践編 第8章 GUIアプリケーション": "실전편 제8장 GUI 애플리케이션",
        "実践編 第9章 図形描画とマウスイベント": "실전편 제9장 도형 그리기와 마우스 이벤트",
        "実践編 第10章 ネットワーク": "실전편 제10장 네트워크",
        "実践編 第11章 一歩進んだJava": "실전편 제11장 한 걸음 더 나간 Java"
      },
      zh: {
        "第1章 Java言語に触れる": "第1章 初识Java语言",
        "第2章 Java言語の基本": "第2章 Java语言基础",
        "第3章 条件分岐と繰り返し": "第3章 条件分支与循环",
        "第4章 メソッド": "第4章 方法",
        "第5章 クラスの基本": "第5章 类的基础",
        "第6章 クラスの一歩進んだ使い方": "第6章 类的进阶用法",
        "第7章 継承": "第7章 继承",
        "第8章 抽象クラスとインタフェース": "第8章 抽象类与接口",
        "実践編 第1章 パッケージとJava API": "实践篇 第1章 包与Java API",
        "実践編 第2章 例外処理": "实践篇 第2章 异常处理",
        "実践編 第3章 スレッド": "实践篇 第3章 线程",
        "実践編 第4章 GCとメモリ管理": "实践篇 第4章 GC与内存管理",
        "実践編 第5章 コレクション": "实践篇 第5章 集合",
        "実践編 第6章 ラムダ式": "实践篇 第6章 Lambda表达式",
        "実践編 第7章 入出力（I/O）": "实践篇 第7章 输入输出(I/O)",
        "実践編 第8章 GUIアプリケーション": "实践篇 第8章 GUI应用程序",
        "実践編 第9章 図形描画とマウスイベント": "实践篇 第9章 图形绘制与鼠标事件",
        "実践編 第10章 ネットワーク": "实践篇 第10章 网络",
        "実践編 第11章 一歩進んだJava": "实践篇 第11章 Java进阶"
      },
      my: {
        "第1章 Java言語に触れる": "အခန်း 1 Java ဘာသာစကား မိတ်ဆက်",
        "第2章 Java言語の基本": "အခန်း 2 Java ဘာသာစကား အခြေခံ",
        "第3章 条件分岐と繰り返し": "အခန်း 3 အခြေအနေ ခွဲခြားခြင်းနှင့် ထပ်ခါတလဲလဲ",
        "第4章 メソッド": "အခန်း 4 Method များ",
        "第5章 クラスの基本": "အခန်း 5 Class အခြေခံ",
        "第6章 クラスの一歩進んだ使い方": "အခန်း 6 Class အဆင့်မြင့် အသုံးပြုနည်း",
        "第7章 継承": "အခန်း 7 အမွေဆက်ခံခြင်း",
        "第8章 抽象クラスとインタフェース": "အခန်း 8 Abstract Class နှင့် Interface",
        "実践編 第1章 パッケージとJava API": "လက်တွေ့ အခန်း 1 Package များနှင့် Java API",
        "実践編 第2章 例外処理": "လက်တွေ့ အခန်း 2 ခြွင်းချက် ကိုင်တွယ်ခြင်း",
        "実践編 第3章 スレッド": "လက်တွေ့ အခန်း 3 Thread များ",
        "実践編 第4章 GCとメモリ管理": "လက်တွေ့ အခန်း 4 GC နှင့် Memory စီမံခန့်ခွဲမှု",
        "実践編 第5章 コレクション": "လက်တွေ့ အခန်း 5 Collection များ",
        "実践編 第6章 ラムダ式": "လက်တွေ့ အခန်း 6 Lambda Expression",
        "実践編 第7章 入出力（I/O）": "လက်တွေ့ အခန်း 7 Input/Output (I/O)",
        "実践編 第8章 GUIアプリケーション": "လက်တွေ့ အခန်း 8 GUI Application",
        "実践編 第9章 図形描画とマウスイベント": "လက်တွေ့ အခန်း 9 ပုံဆွဲခြင်းနှင့် Mouse Event",
        "実践編 第10章 ネットワーク": "လက်တွေ့ အခန်း 10 Network",
        "実践編 第11章 一歩進んだJava": "လက်တွေ့ အခန်း 11 အဆင့်မြင့် Java"
      },
      vi: {
        "第1章 Java言語に触れる": "Chương 1 Làm quen với ngôn ngữ Java",
        "第2章 Java言語の基本": "Chương 2 Cơ bản về ngôn ngữ Java",
        "第3章 条件分岐と繰り返し": "Chương 3 Rẽ nhánh và lặp",
        "第4章 メソッド": "Chương 4 Phương thức",
        "第5章 クラスの基本": "Chương 5 Cơ bản về lớp",
        "第6章 クラスの一歩進んだ使い方": "Chương 6 Sử dụng lớp nâng cao",
        "第7章 継承": "Chương 7 Kế thừa",
        "第8章 抽象クラスとインタフェース": "Chương 8 Lớp trừu tượng và Interface",
        "実践編 第1章 パッケージとJava API": "Thực hành Ch.1 Package và Java API",
        "実践編 第2章 例外処理": "Thực hành Ch.2 Xử lý ngoại lệ",
        "実践編 第3章 スレッド": "Thực hành Ch.3 Luồng",
        "実践編 第4章 GCとメモリ管理": "Thực hành Ch.4 GC và quản lý bộ nhớ",
        "実践編 第5章 コレクション": "Thực hành Ch.5 Bộ sưu tập",
        "実践編 第6章 ラムダ式": "Thực hành Ch.6 Biểu thức Lambda",
        "実践編 第7章 入出力（I/O）": "Thực hành Ch.7 Nhập/Xuất (I/O)",
        "実践編 第8章 GUIアプリケーション": "Thực hành Ch.8 Ứng dụng GUI",
        "実践編 第9章 図形描画とマウスイベント": "Thực hành Ch.9 Vẽ hình và sự kiện chuột",
        "実践編 第10章 ネットワーク": "Thực hành Ch.10 Mạng",
        "実践編 第11章 一歩進んだJava": "Thực hành Ch.11 Java nâng cao"
      },
      th: {
        "第1章 Java言語に触れる": "บทที่ 1 ทำความรู้จักภาษา Java",
        "第2章 Java言語の基本": "บทที่ 2 พื้นฐานภาษา Java",
        "第3章 条件分岐と繰り返し": "บทที่ 3 การแยกเงื่อนไขและการวนซ้ำ",
        "第4章 メソッド": "บทที่ 4 เมธอด",
        "第5章 クラスの基本": "บทที่ 5 พื้นฐานคลาส",
        "第6章 クラスの一歩進んだ使い方": "บทที่ 6 การใช้คลาสขั้นสูง",
        "第7章 継承": "บทที่ 7 การสืบทอด",
        "第8章 抽象クラスとインタフェース": "บทที่ 8 Abstract Class และ Interface",
        "実践編 第1章 パッケージとJava API": "ปฏิบัติ บทที่ 1 Package และ Java API",
        "実践編 第2章 例外処理": "ปฏิบัติ บทที่ 2 การจัดการข้อยกเว้น",
        "実践編 第3章 スレッド": "ปฏิบัติ บทที่ 3 เธรด",
        "実践編 第4章 GCとメモリ管理": "ปฏิบัติ บทที่ 4 GC และการจัดการหน่วยความจำ",
        "実践編 第5章 コレクション": "ปฏิบัติ บทที่ 5 คอลเลกชัน",
        "実践編 第6章 ラムダ式": "ปฏิบัติ บทที่ 6 นิพจน์ Lambda",
        "実践編 第7章 入出力（I/O）": "ปฏิบัติ บทที่ 7 อินพุต/เอาต์พุต (I/O)",
        "実践編 第8章 GUIアプリケーション": "ปฏิบัติ บทที่ 8 แอปพลิเคชัน GUI",
        "実践編 第9章 図形描画とマウスイベント": "ปฏิบัติ บทที่ 9 วาดรูปและเหตุการณ์เมาส์",
        "実践編 第10章 ネットワーク": "ปฏิบัติ บทที่ 10 เครือข่าย",
        "実践編 第11章 一歩進んだJava": "ปฏิบัติ บทที่ 11 Java ขั้นสูง"
      },
      fr: {
        "第1章 Java言語に触れる": "Chapitre 1 Découverte du langage Java",
        "第2章 Java言語の基本": "Chapitre 2 Les bases du langage Java",
        "第3章 条件分岐と繰り返し": "Chapitre 3 Conditions et boucles",
        "第4章 メソッド": "Chapitre 4 Méthodes",
        "第5章 クラスの基本": "Chapitre 5 Les bases des classes",
        "第6章 クラスの一歩進んだ使い方": "Chapitre 6 Utilisation avancée des classes",
        "第7章 継承": "Chapitre 7 Héritage",
        "第8章 抽象クラスとインタフェース": "Chapitre 8 Classes abstraites et interfaces",
        "実践編 第1章 パッケージとJava API": "Pratique Ch.1 Packages et API Java",
        "実践編 第2章 例外処理": "Pratique Ch.2 Gestion des exceptions",
        "実践編 第3章 スレッド": "Pratique Ch.3 Threads",
        "実践編 第4章 GCとメモリ管理": "Pratique Ch.4 GC et gestion de la mémoire",
        "実践編 第5章 コレクション": "Pratique Ch.5 Collections",
        "実践編 第6章 ラムダ式": "Pratique Ch.6 Expressions lambda",
        "実践編 第7章 入出力（I/O）": "Pratique Ch.7 Entrées/Sorties (I/O)",
        "実践編 第8章 GUIアプリケーション": "Pratique Ch.8 Applications GUI",
        "実践編 第9章 図形描画とマウスイベント": "Pratique Ch.9 Dessin et événements souris",
        "実践編 第10章 ネットワーク": "Pratique Ch.10 Réseau",
        "実践編 第11章 一歩進んだJava": "Pratique Ch.11 Java avancé"
      }
    },
    itpass: {
      ko: {
        "第1章 ハードウェアと基礎理論": "제1장 하드웨어와 기초 이론",
        "第2章 ソフトウェア": "제2장 소프트웨어",
        "第3章 システム構成": "제3장 시스템 구성",
        "第4章 ネットワーク": "제4장 네트워크",
        "第5章 セキュリティ": "제5장 보안",
        "第6章 データベース": "제6장 데이터베이스",
        "第7章 アルゴリズムとプログラミング": "제7장 알고리즘과 프로그래밍",
        "第8章 マネジメント": "제8장 매니지먼트",
        "第9章 企業活動と法務": "제9장 기업 활동과 법무",
        "第10章 経営戦略とシステム戦略": "제10장 경영 전략과 시스템 전략"
      },
      zh: {
        "第1章 ハードウェアと基礎理論": "第1章 硬件与基础理论",
        "第2章 ソフトウェア": "第2章 软件",
        "第3章 システム構成": "第3章 系统构成",
        "第4章 ネットワーク": "第4章 网络",
        "第5章 セキュリティ": "第5章 安全",
        "第6章 データベース": "第6章 数据库",
        "第7章 アルゴリズムとプログラミング": "第7章 算法与编程",
        "第8章 マネジメント": "第8章 管理",
        "第9章 企業活動と法務": "第9章 企业活动与法务",
        "第10章 経営戦略とシステム戦略": "第10章 经营战略与系统战略"
      },
      my: {
        "第1章 ハードウェアと基礎理論": "အခန်း 1 Hardware နှင့် အခြေခံ သီအိုရီ",
        "第2章 ソフトウェア": "အခန်း 2 Software",
        "第3章 システム構成": "အခန်း 3 System ဖွဲ့စည်းပုံ",
        "第4章 ネットワーク": "အခန်း 4 Network",
        "第5章 セキュリティ": "အခန်း 5 လုံခြုံရေး",
        "第6章 データベース": "အခန်း 6 Database",
        "第7章 アルゴリズムとプログラミング": "အခန်း 7 Algorithm နှင့် Programming",
        "第8章 マネジメント": "အခန်း 8 Management",
        "第9章 企業活動と法務": "အခန်း 9 လုပ်ငန်းလုပ်ဆောင်ချက်နှင့် ဥပဒေ",
        "第10章 経営戦略とシステム戦略": "အခန်း 10 စီးပွားရေး မဟာဗျူဟာနှင့် System မဟာဗျူဟာ"
      },
      vi: {
        "第1章 ハードウェアと基礎理論": "Chương 1 Phần cứng và lý thuyết cơ bản",
        "第2章 ソフトウェア": "Chương 2 Phần mềm",
        "第3章 システム構成": "Chương 3 Cấu hình hệ thống",
        "第4章 ネットワーク": "Chương 4 Mạng",
        "第5章 セキュリティ": "Chương 5 Bảo mật",
        "第6章 データベース": "Chương 6 Cơ sở dữ liệu",
        "第7章 アルゴリズムとプログラミング": "Chương 7 Thuật toán và lập trình",
        "第8章 マネジメント": "Chương 8 Quản lý",
        "第9章 企業活動と法務": "Chương 9 Hoạt động doanh nghiệp và pháp luật",
        "第10章 経営戦略とシステム戦略": "Chương 10 Chiến lược kinh doanh và hệ thống"
      },
      th: {
        "第1章 ハードウェアと基礎理論": "บทที่ 1 ฮาร์ดแวร์และทฤษฎีพื้นฐาน",
        "第2章 ソフトウェア": "บทที่ 2 ซอฟต์แวร์",
        "第3章 システム構成": "บทที่ 3 องค์ประกอบระบบ",
        "第4章 ネットワーク": "บทที่ 4 เครือข่าย",
        "第5章 セキュリティ": "บทที่ 5 ความมั่นคงปลอดภัย",
        "第6章 データベース": "บทที่ 6 ฐานข้อมูล",
        "第7章 アルゴリズムとプログラミング": "บทที่ 7 อัลกอริทึมและการเขียนโปรแกรม",
        "第8章 マネジメント": "บทที่ 8 การจัดการ",
        "第9章 企業活動と法務": "บทที่ 9 กิจกรรมองค์กรและกฎหมาย",
        "第10章 経営戦略とシステム戦略": "บทที่ 10 กลยุทธ์ธุรกิจและระบบ"
      },
      fr: {
        "第1章 ハードウェアと基礎理論": "Chapitre 1 Matériel et théorie de base",
        "第2章 ソフトウェア": "Chapitre 2 Logiciels",
        "第3章 システム構成": "Chapitre 3 Configuration système",
        "第4章 ネットワーク": "Chapitre 4 Réseau",
        "第5章 セキュリティ": "Chapitre 5 Sécurité",
        "第6章 データベース": "Chapitre 6 Bases de données",
        "第7章 アルゴリズムとプログラミング": "Chapitre 7 Algorithmes et programmation",
        "第8章 マネジメント": "Chapitre 8 Management",
        "第9章 企業活動と法務": "Chapitre 9 Activités d'entreprise et droit",
        "第10章 経営戦略とシステム戦略": "Chapitre 10 Stratégie d'entreprise et système"
      }
    },
    python: {
      ko: {
        "第1章 プログラミングをはじめる前に知っておこう": "제1장 프로그래밍 시작 전 알아야 할 것",
        "第2章 Pythonプログラムの作成と実行": "제2장 Python 프로그램 작성과 실행",
        "第3章 演算と変数・入力": "제3장 연산과 변수, 입력",
        "第4章 条件分岐": "제4장 조건 분기",
        "第5章 コレクション": "제5장 컬렉션",
        "第6章 繰り返し処理": "제6장 반복 처리",
        "第7章 関数": "제7장 함수",
        "第8章 クラス": "제8장 클래스",
        "第9章 モジュールとパッケージ": "제9장 모듈과 패키지",
        "第10章 標準ライブラリ": "제10장 표준 라이브러리",
        "第11章 ファイル操作": "제11장 파일 조작",
        "第12章 正規表現": "제12장 정규 표현식",
        "第13章 例外処理": "제13장 예외 처리"
      },
      zh: {
        "第1章 プログラミングをはじめる前に知っておこう": "第1章 开始编程前必须了解的知识",
        "第2章 Pythonプログラムの作成と実行": "第2章 Python程序的创建与执行",
        "第3章 演算と変数・入力": "第3章 运算、变量与输入",
        "第4章 条件分岐": "第4章 条件分支",
        "第5章 コレクション": "第5章 集合",
        "第6章 繰り返し処理": "第6章 循环处理",
        "第7章 関数": "第7章 函数",
        "第8章 クラス": "第8章 类",
        "第9章 モジュールとパッケージ": "第9章 模块与包",
        "第10章 標準ライブラリ": "第10章 标准库",
        "第11章 ファイル操作": "第11章 文件操作",
        "第12章 正規表現": "第12章 正则表达式",
        "第13章 例外処理": "第13章 异常处理"
      },
      my: {
        "第1章 プログラミングをはじめる前に知っておこう": "အခန်း 1 Programming မစတင်မီ သိထားရမည့်အရာ",
        "第2章 Pythonプログラムの作成と実行": "အခန်း 2 Python Program ရေးသားခြင်းနှင့် Run ခြင်း",
        "第3章 演算と変数・入力": "အခန်း 3 တွက်ချက်ခြင်း၊ ကိန်းရှင်နှင့် Input",
        "第4章 条件分岐": "အခန်း 4 အခြေအနေ ခွဲခြားခြင်း",
        "第5章 コレクション": "အခန်း 5 Collection များ",
        "第6章 繰り返し処理": "အခန်း 6 ထပ်ခါတလဲလဲ လုပ်ဆောင်ခြင်း",
        "第7章 関数": "အခန်း 7 Function များ",
        "第8章 クラス": "အခန်း 8 Class များ",
        "第9章 モジュールとパッケージ": "အခန်း 9 Module နှင့် Package",
        "第10章 標準ライブラリ": "အခန်း 10 Standard Library",
        "第11章 ファイル操作": "အခန်း 11 File လုပ်ဆောင်ချက်များ",
        "第12章 正規表現": "အခန်း 12 Regular Expression",
        "第13章 例外処理": "အခန်း 13 ခြွင်းချက် ကိုင်တွယ်ခြင်း"
      },
      vi: {
        "第1章 プログラミングをはじめる前に知っておこう": "Chương 1 Kiến thức cần biết trước khi lập trình",
        "第2章 Pythonプログラムの作成と実行": "Chương 2 Tạo và chạy chương trình Python",
        "第3章 演算と変数・入力": "Chương 3 Phép toán, biến và nhập liệu",
        "第4章 条件分岐": "Chương 4 Rẽ nhánh điều kiện",
        "第5章 コレクション": "Chương 5 Bộ sưu tập",
        "第6章 繰り返し処理": "Chương 6 Xử lý lặp",
        "第7章 関数": "Chương 7 Hàm",
        "第8章 クラス": "Chương 8 Lớp",
        "第9章 モジュールとパッケージ": "Chương 9 Module và Package",
        "第10章 標準ライブラリ": "Chương 10 Thư viện chuẩn",
        "第11章 ファイル操作": "Chương 11 Thao tác tệp",
        "第12章 正規表現": "Chương 12 Biểu thức chính quy",
        "第13章 例外処理": "Chương 13 Xử lý ngoại lệ"
      },
      th: {
        "第1章 プログラミングをはじめる前に知っておこう": "บทที่ 1 สิ่งที่ควรรู้ก่อนเริ่มเขียนโปรแกรม",
        "第2章 Pythonプログラムの作成と実行": "บทที่ 2 สร้างและรันโปรแกรม Python",
        "第3章 演算と変数・入力": "บทที่ 3 การคำนวณ ตัวแปร และอินพุต",
        "第4章 条件分岐": "บทที่ 4 การแยกเงื่อนไข",
        "第5章 コレクション": "บทที่ 5 คอลเลกชัน",
        "第6章 繰り返し処理": "บทที่ 6 การวนซ้ำ",
        "第7章 関数": "บทที่ 7 ฟังก์ชัน",
        "第8章 クラス": "บทที่ 8 คลาส",
        "第9章 モジュールとパッケージ": "บทที่ 9 โมดูลและแพ็กเกจ",
        "第10章 標準ライブラリ": "บทที่ 10 ไลบรารีมาตรฐาน",
        "第11章 ファイル操作": "บทที่ 11 การทำงานกับไฟล์",
        "第12章 正規表現": "บทที่ 12 Regular Expression",
        "第13章 例外処理": "บทที่ 13 การจัดการข้อยกเว้น"
      },
      fr: {
        "第1章 プログラミングをはじめる前に知っておこう": "Chapitre 1 À savoir avant de programmer",
        "第2章 Pythonプログラムの作成と実行": "Chapitre 2 Création et exécution de programmes Python",
        "第3章 演算と変数・入力": "Chapitre 3 Opérations, variables et saisie",
        "第4章 条件分岐": "Chapitre 4 Conditions",
        "第5章 コレクション": "Chapitre 5 Collections",
        "第6章 繰り返し処理": "Chapitre 6 Boucles",
        "第7章 関数": "Chapitre 7 Fonctions",
        "第8章 クラス": "Chapitre 8 Classes",
        "第9章 モジュールとパッケージ": "Chapitre 9 Modules et packages",
        "第10章 標準ライブラリ": "Chapitre 10 Bibliothèque standard",
        "第11章 ファイル操作": "Chapitre 11 Opérations sur fichiers",
        "第12章 正規表現": "Chapitre 12 Expressions régulières",
        "第13章 例外処理": "Chapitre 13 Gestion des exceptions"
      }
    },
    sg: {
      ko: {
        "第1章 情報セキュリティとは": "제1장 정보보안이란",
        "第2章 情報セキュリティ技術": "제2장 정보보안 기술",
        "第3章 情報セキュリティ管理": "제3장 정보보안 관리",
        "第4章 情報セキュリティ対策": "제4장 정보보안 대책",
        "第5章 法務": "제5장 법무",
        "第6章 マネジメント": "제6장 매니지먼트",
        "第7章 テクノロジ": "제7장 테크놀로지",
        "第8章 ストラテジ": "제8장 전략",
        "第9章 科目B問題対策": "제9장 과목B 문제 대책"
      },
      zh: {
        "第1章 情報セキュリティとは": "第1章 什么是信息安全",
        "第2章 情報セキュリティ技術": "第2章 信息安全技术",
        "第3章 情報セキュリティ管理": "第3章 信息安全管理",
        "第4章 情報セキュリティ対策": "第4章 信息安全对策",
        "第5章 法務": "第5章 法务",
        "第6章 マネジメント": "第6章 管理",
        "第7章 テクノロジ": "第7章 技术",
        "第8章 ストラテジ": "第8章 战略",
        "第9章 科目B問題対策": "第9章 科目B试题对策"
      },
      my: {
        "第1章 情報セキュリティとは": "အခန်း 1 Information Security ဆိုသည်မှာ",
        "第2章 情報セキュリティ技術": "အခန်း 2 Information Security နည်းပညာ",
        "第3章 情報セキュリティ管理": "အခန်း 3 Information Security စီမံခန့်ခွဲမှု",
        "第4章 情報セキュリティ対策": "အခန်း 4 Information Security ကာကွယ်မှု",
        "第5章 法務": "အခန်း 5 ဥပဒေ",
        "第6章 マネジメント": "အခန်း 6 Management",
        "第7章 テクノロジ": "အခန်း 7 Technology",
        "第8章 ストラテジ": "အခန်း 8 Strategy",
        "第9章 科目B問題対策": "အခန်း 9 Subject B မေးခွန်း ပြင်ဆင်ခြင်း"
      },
      vi: {
        "第1章 情報セキュリティとは": "Chương 1 An toàn thông tin là gì",
        "第2章 情報セキュリティ技術": "Chương 2 Kỹ thuật an toàn thông tin",
        "第3章 情報セキュリティ管理": "Chương 3 Quản lý an toàn thông tin",
        "第4章 情報セキュリティ対策": "Chương 4 Biện pháp an toàn thông tin",
        "第5章 法務": "Chương 5 Pháp luật",
        "第6章 マネジメント": "Chương 6 Quản lý",
        "第7章 テクノロジ": "Chương 7 Công nghệ",
        "第8章 ストラテジ": "Chương 8 Chiến lược",
        "第9章 科目B問題対策": "Chương 9 Ôn tập môn B"
      },
      th: {
        "第1章 情報セキュリティとは": "บทที่ 1 ความมั่นคงปลอดภัยสารสนเทศคืออะไร",
        "第2章 情報セキュリティ技術": "บทที่ 2 เทคโนโลยีความมั่นคงปลอดภัย",
        "第3章 情報セキュリティ管理": "บทที่ 3 การจัดการความมั่นคงปลอดภัย",
        "第4章 情報セキュリティ対策": "บทที่ 4 มาตรการความมั่นคงปลอดภัย",
        "第5章 法務": "บทที่ 5 กฎหมาย",
        "第6章 マネジメント": "บทที่ 6 การจัดการ",
        "第7章 テクノロジ": "บทที่ 7 เทคโนโลยี",
        "第8章 ストラテジ": "บทที่ 8 กลยุทธ์",
        "第9章 科目B問題対策": "บทที่ 9 เตรียมสอบวิชา B"
      },
      fr: {
        "第1章 情報セキュリティとは": "Chapitre 1 Qu'est-ce que la sécurité de l'information",
        "第2章 情報セキュリティ技術": "Chapitre 2 Techniques de sécurité",
        "第3章 情報セキュリティ管理": "Chapitre 3 Gestion de la sécurité",
        "第4章 情報セキュリティ対策": "Chapitre 4 Mesures de sécurité",
        "第5章 法務": "Chapitre 5 Droit",
        "第6章 マネジメント": "Chapitre 6 Management",
        "第7章 テクノロジ": "Chapitre 7 Technologie",
        "第8章 ストラテジ": "Chapitre 8 Stratégie",
        "第9章 科目B問題対策": "Chapitre 9 Préparation épreuve B"
      }
    }
  };

  /* ─── Load lesson data ─── */
  function loadLessons(file) {
    var src = fs.readFileSync(path.join(ROOT, "data", file), "utf8");
    var match = src.match(/const\s+(\w+)\s*=\s*/);
    var varName = match ? match[1] : "LESSONS";
    var fn = new Function(src + "; return " + varName + ";");
    return fn();
  }

  function loadContentPack(subject, lang) {
    var file = path.join(OUT_DIR, subject + "_" + lang + ".js");
    if (!fs.existsSync(file)) return {};
    var src = fs.readFileSync(file, "utf8");
    var store = {};
    var windowObj = { CONTENT_I18N: store };
    try {
      new Function("window", src)(windowObj);
    } catch (e) { /* ignore */ }
    return windowObj.CONTENT_I18N || store;
  }

  /* ─── Extract titles from content packs ─── */
  function extractTitlesFromPack(subject, lang) {
    var pack = loadContentPack(subject, lang);
    var titles = {};
    var prefix = subject + ":";
    Object.keys(pack).forEach(function (key) {
      if (key.indexOf(prefix) !== 0) return;
      var id = parseInt(key.substring(prefix.length), 10);
      if (isNaN(id)) return;
      var entry = pack[key][lang];
      if (entry && entry.title) {
        titles[id] = entry.title;
      }
    });
    return titles;
  }

  /* ─── Extract titles from SQL locales field ─── */
  function extractTitlesFromLocales(lessons, lang) {
    var titles = {};
    lessons.forEach(function (l) {
      if (l.locales && l.locales.title && l.locales.title[lang]) {
        titles[l.id] = l.locales.title[lang];
      }
    });
    return titles;
  }

  /* ─── Extract zh titles from lesson data ─── */
  function extractZhTitles(lessons) {
    var titles = {};
    lessons.forEach(function (l) {
      if (l.titleZh) titles[l.id] = l.titleZh;
      if (l.locales && l.locales.title && l.locales.title.zh) {
        titles[l.id] = l.locales.title.zh;
      }
    });
    return titles;
  }

  /* ─── Extract ja titles from lesson data ─── */
  function extractJaTitles(lessons) {
    var titles = {};
    lessons.forEach(function (l) {
      if (l.titleJa) titles[l.id] = l.titleJa;
    });
    return titles;
  }

  /* ─── Get unique chapters from lessons ─── */
  function getChapters(lessons) {
    var seen = {};
    lessons.forEach(function (l) {
      var ch = l.chapterName || "";
      if (ch && !seen[ch]) seen[ch] = true;
    });
    return Object.keys(seen);
  }

  /* ─── Build navigation pack for one language ─── */
  function buildNavPack(lang, sqlLessons, javaLessons, pythonLessons, itpassLessons, sgLessons) {
    var nav = {};

    /* SQL */
    var sqlChapters = getChapters(sqlLessons);
    var sqlTitles = {};
    if (lang === "zh") {
      sqlTitles = extractTitlesFromLocales(sqlLessons, "zh");
      /* Fallback to titleZh */
      sqlLessons.forEach(function(l) { if (!sqlTitles[l.id] && l.titleZh) sqlTitles[l.id] = l.titleZh; });
    } else if (lang === "ko") {
      sqlTitles = extractTitlesFromLocales(sqlLessons, "ko");
      var packTitles = extractTitlesFromPack("sql", lang);
      Object.keys(packTitles).forEach(function(id) { sqlTitles[id] = packTitles[id]; });
    } else {
      sqlTitles = extractTitlesFromPack("sql", lang);
    }
    nav.sql = {
      chapters: (CHAPTER_TRANSLATIONS.sql[lang] || {}),
      titles: sqlTitles
    };

    /* Java */
    var javaChapters = getChapters(javaLessons);
    var javaTitles = {};
    if (lang === "zh") {
      javaTitles = extractZhTitles(javaLessons);
    } else {
      javaTitles = extractTitlesFromPack("java", lang);
    }
    nav.java = {
      chapters: (CHAPTER_TRANSLATIONS.java[lang] || {}),
      titles: javaTitles
    };

    /* Python */
    var pythonTitles = {};
    if (lang === "zh") {
      pythonTitles = extractZhTitles(pythonLessons);
    } else {
      pythonTitles = extractTitlesFromPack("python", lang);
    }
    nav.python = {
      chapters: (CHAPTER_TRANSLATIONS.python[lang] || {}),
      titles: pythonTitles
    };

    /* IT Passport */
    var itpassTitles = {};
    if (lang === "zh") {
      itpassTitles = extractZhTitles(itpassLessons);
    } else {
      itpassTitles = extractTitlesFromPack("itpass", lang);
    }
    nav.itpass = {
      chapters: (CHAPTER_TRANSLATIONS.itpass[lang] || {}),
      titles: itpassTitles
    };

    /* SG */
    var sgTitles = {};
    if (lang === "zh") {
      sgTitles = extractZhTitles(sgLessons);
    } else {
      sgTitles = extractTitlesFromPack("sg", lang);
    }
    nav.sg = {
      chapters: (CHAPTER_TRANSLATIONS.sg[lang] || {}),
      titles: sgTitles
    };

    return nav;
  }

  /* ─── Generate output file ─── */
  function writeNavFile(lang, nav) {
    var lines = [];
    lines.push("/* Navigation I18n Pack — " + lang + " */");
    lines.push("/* Auto-generated by scripts/generate_navigation_packs.js */");
    lines.push("(function () {");
    lines.push('  "use strict";');
    lines.push("  var NAV = window.NAVIGATION_I18N = window.NAVIGATION_I18N || {};");
    lines.push("  NAV." + lang + " = {");

    var subjects = ["sql", "java", "python", "itpass", "sg"];
    subjects.forEach(function (subj, si) {
      lines.push("    " + subj + ": {");

      /* chapters */
      lines.push("      chapters: {");
      var chEntries = Object.entries(nav[subj].chapters);
      chEntries.forEach(function (pair, i) {
        var comma = i < chEntries.length - 1 ? "," : "";
        lines.push('        ' + JSON.stringify(pair[0]) + ": " + JSON.stringify(pair[1]) + comma);
      });
      lines.push("      },");

      /* titles */
      lines.push("      titles: {");
      var titleEntries = Object.entries(nav[subj].titles);
      titleEntries.sort(function (a, b) { return parseInt(a[0]) - parseInt(b[0]); });
      titleEntries.forEach(function (pair, i) {
        var comma = i < titleEntries.length - 1 ? "," : "";
        lines.push("        " + pair[0] + ": " + JSON.stringify(pair[1]) + comma);
      });
      lines.push("      }");

      var comma = si < subjects.length - 1 ? "," : "";
      lines.push("    }" + comma);
    });

    lines.push("  };");
    lines.push("})();");
    lines.push("");

    var outFile = path.join(OUT_DIR, "navigation_" + lang + ".js");
    fs.writeFileSync(outFile, lines.join("\n"), "utf8");
    console.log("  Written: " + outFile + " (" + lines.length + " lines)");
  }

  /* ─── Main ─── */
  console.log("Generating navigation packs...");

  var sqlLessons = loadLessons("lessons.js");
  var javaLessons = loadLessons("java_lessons.js");
  var pythonLessons = loadLessons("python_lessons.js");
  var itpassLessons = loadLessons("it_passport_lessons.js");
  var sgLessons = loadLessons("sg_lessons.js");

  console.log("Loaded lessons: SQL=" + sqlLessons.length + " Java=" + javaLessons.length +
    " Python=" + pythonLessons.length + " ITPass=" + itpassLessons.length + " SG=" + sgLessons.length);

  /* For IT Passport, Python, SG chapter translations — generate from lesson data */
  var itpassChapters = getChapters(itpassLessons);
  var pythonChapters = getChapters(pythonLessons);
  var sgChapters = getChapters(sgLessons);

  console.log("Chapters: ITPass=" + itpassChapters.length + " Python=" + pythonChapters.length + " SG=" + sgChapters.length);

  var langs = ["ko", "my", "vi", "th", "fr", "zh"];
  langs.forEach(function (lang) {
    var nav = buildNavPack(lang, sqlLessons, javaLessons, pythonLessons, itpassLessons, sgLessons);
    writeNavFile(lang, nav);
  });

  console.log("\nDone! Generated " + langs.length + " navigation packs.");
})();
