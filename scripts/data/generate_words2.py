#!/usr/bin/env python3
"""Generate a second batch of new words and merge into word_set.json."""
import json
import pathlib
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
EXISTING_FILE = REPO_ROOT / "EnglishLearnApp" / "data" / "word_set.json"

# Base epoch for createdAt field (1995-02-22 UTC — arbitrary but deterministic)
BASE_TIMESTAMP = 793378800.0

VERB_TMPL = [
    ("It is important to {b} in the right way.", "{m}ことが重要だ。", "一般的な使い方"),
    ("She decided to {b} without hesitation.", "彼女はためらわずに{m}ことにした。", "一般的な使い方"),
    ("He {past} successfully despite the obstacles.", "障害にもかかわらず、彼はうまく{m}た。", "一般的な使い方"),
    ("We should always {b} with care and purpose.", "常に注意と目的を持って{m}べきだ。", "一般的な使い方"),
    ("The team needs to {b} before the deadline.", "チームは締め切り前に{m}必要がある。", "ビジネス"),
    ("Managers are expected to {b} efficiently.", "マネージャーは効率的に{m}ことが期待されている。", "ビジネス"),
    ("The organization decided to {b} its resources wisely.", "組織はリソースを賢く{m}ことにした。", "ビジネス"),
    ("Successful companies know how to {b} under pressure.", "成功している企業はプレッシャーの下で{m}方法を知っている。", "ビジネス"),
    ("Can you help me {b} this properly?", "これを正しく{m}のを手伝ってもらえますか？", "日常会話"),
    ("Do you know the best way to {b}?", "{m}のに最善の方法を知っていますか？", "日常会話"),
    ("I am still learning how to {b} effectively.", "効果的に{m}方法をまだ学んでいる。", "日常会話"),
    ("Students must {b} regularly to make progress.", "進歩するためには定期的に{m}なければならない。", "教育"),
    ("Schools should teach students how to {b} well.", "学校では生徒が上手く{m}よう教えるべきだ。", "教育"),
    ("Research shows that those who {b} consistently tend to succeed.", "継続して{m}人は成功しやすいと研究が示している。", "教育"),
    ("Regular practice helps you {b} better over time.", "定期的な練習によって、徐々に{m}ことが上達する。", "健康"),
    ("It is healthy and productive to {b} mindfully.", "意識的に{m}ことは健全で生産的だ。", "健康"),
    ("Modern technology makes it easier to {b} at scale.", "現代のテクノロジーによって大規模に{m}ことが容易になった。", "テクノロジー"),
    ("AI systems are increasingly able to {b} automatically.", "AIシステムは自動的に{m}ことができるようになりつつある。", "テクノロジー"),
    ("The ability to {b} well is a valuable life skill.", "上手く{m}能力は貴重な人生のスキルだ。", "人生の教訓"),
    ("If you {b} consistently and thoughtfully, you will see results.", "継続して思慮深く{m}ば、必ず結果が出る。", "人生の教訓"),
]

ADJ_TMPL = [
    ("A {b} approach has proven effective in many situations.", "{m}アプローチは多くの状況で効果的であることが証明されている。", "一般的な使い方"),
    ("Being {b} is essential in challenging environments.", "{m}ことは困難な環境において不可欠だ。", "一般的な使い方"),
    ("She has a {b} understanding of the subject.", "彼女はその分野について{m}理解を持っている。", "一般的な使い方"),
    ("The results were more {b} than anyone expected.", "結果は誰もが予想したよりも{m}だった。", "一般的な使い方"),
    ("A {b} plan is the foundation of a successful project.", "{m}計画が成功するプロジェクトの基盤となる。", "ビジネス"),
    ("The company's {b} strategy helped it grow rapidly.", "会社の{m}戦略が急速な成長を助けた。", "ビジネス"),
    ("We need a {b} solution to this business challenge.", "このビジネス上の課題には{m}解決策が必要だ。", "ビジネス"),
    ("Her {b} leadership style inspired the entire team.", "彼女の{m}リーダーシップスタイルはチーム全体を鼓舞した。", "ビジネス"),
    ("It is {b} to ask for help when you need it.", "助けが必要なときに求めることは{m}だ。", "日常会話"),
    ("He was {b} enough to admit he was wrong.", "彼は間違っていることを認めるほど{m}だった。", "日常会話"),
    ("Being {b} in difficult times makes a big difference.", "困難なときに{m}ことは大きな違いを生む。", "日常会話"),
    ("A {b} mindset is essential for learning.", "{m}マインドセットは学習に不可欠だ。", "教育"),
    ("Teachers should be {b} when evaluating students.", "教師は生徒を評価する際に{m}であるべきだ。", "教育"),
    ("Students who are {b} tend to achieve better results.", "{m}学生は良い成果を上げる傾向がある。", "教育"),
    ("Maintaining a {b} lifestyle promotes long-term well-being.", "{m}ライフスタイルを維持することは長期的な幸福を促進する。", "健康"),
    ("Doctors recommend {b} habits for good health.", "医師は健康のために{m}習慣を勧める。", "健康"),
    ("A {b} approach to problem-solving saves time and resources.", "問題解決への{m}アプローチは時間とリソースを節約する。", "テクノロジー"),
    ("The {b} design of the software made it easy to use.", "ソフトウェアの{m}デザインにより使いやすくなった。", "テクノロジー"),
    ("Being {b} is one of the most important qualities a person can have.", "{m}であることは人が持てる最も重要な資質の一つだ。", "人生の教訓"),
    ("A {b} perspective often leads to more creative solutions.", "{m}視点はしばしばより創造的な解決策をもたらす。", "人生の教訓"),
]

NOUN_TMPL = [
    ("The {b} of this project cannot be overstated.", "このプロジェクトの{m}はいくら強調してもしすぎることはない。", "一般的な使い方"),
    ("She demonstrated exceptional {b} in solving the problem.", "彼女は問題解決において卓越した{m}を発揮した。", "一般的な使い方"),
    ("Building strong {b} takes time and consistent effort.", "強い{m}を築くには時間と継続的な努力が必要だ。", "一般的な使い方"),
    ("Without sufficient {b}, the plan is likely to fail.", "十分な{m}がなければ、計画は失敗する可能性が高い。", "一般的な使い方"),
    ("Improving {b} is a top priority for the organization.", "{m}の改善は組織の最優先事項だ。", "ビジネス"),
    ("The company invested heavily in developing {b}.", "会社は{m}の発展に多大な投資をした。", "ビジネス"),
    ("Effective {b} leads to better business outcomes.", "効果的な{m}はより良いビジネスの結果につながる。", "ビジネス"),
    ("Strong {b} gives companies a competitive advantage.", "強い{m}は企業に競争上の優位性をもたらす。", "ビジネス"),
    ("Many people struggle with developing good {b}.", "多くの人が良い{m}を育むことに苦労している。", "日常会話"),
    ("Sharing your {b} openly can benefit others greatly.", "自分の{m}を率直に分かち合うことは他者に大きな利益をもたらす。", "日常会話"),
    ("His {b} proved invaluable in navigating the challenge.", "彼の{m}はその困難を乗り越えるうえで非常に価値があった。", "日常会話"),
    ("Developing {b} early in life has lasting benefits.", "人生の早い段階で{m}を育てることには長期的な効果がある。", "教育"),
    ("Schools should focus on nurturing students' {b}.", "学校は生徒の{m}を育てることに注力すべきだ。", "教育"),
    ("Research highlights the importance of {b} in academic success.", "研究は学業の成功における{m}の重要性を強調している。", "教育"),
    ("Good {b} is directly linked to improved well-being.", "良い{m}は幸福感の向上と直接結びついている。", "健康"),
    ("Healthcare professionals emphasize the role of {b} in recovery.", "医療専門家は回復における{m}の役割を強調する。", "健康"),
    ("Technology has transformed how we develop and use {b}.", "テクノロジーは{m}を発展させ活用する方法を変えた。", "テクノロジー"),
    ("Digital tools enhance {b} in ways previously impossible.", "デジタルツールは以前は不可能だった方法で{m}を高める。", "テクノロジー"),
    ("True {b} comes from experience, reflection, and perseverance.", "真の{m}は経験、内省、そして粘り強さから生まれる。", "人生の教訓"),
    ("Invest in your {b}—it will pay dividends throughout your life.", "自分の{m}に投資しなさい。それは生涯にわたって報われる。", "人生の教訓"),
]

def make_verb(word, ja, ipa, forms, ja_sent):
    sents = []
    for eng_t, jpn_t, cat in VERB_TMPL:
        eng = eng_t.replace("{b}", word).replace("{3p}", forms.get("3p", word+"s"))\
                   .replace("{past}", forms.get("past", word+"ed"))\
                   .replace("{ing}", forms.get("ing", word+"ing"))
        jpn = jpn_t.replace("{m}", ja_sent)
        sents.append((eng, jpn, cat))
    return (word, ja, ipa, sents)

def make_adj(word, ja, ipa, ja_sent):
    sents = []
    for eng_t, jpn_t, cat in ADJ_TMPL:
        eng = eng_t.replace("{b}", word)
        jpn = jpn_t.replace("{m}", ja_sent)
        sents.append((eng, jpn, cat))
    return (word, ja, ipa, sents)

def make_noun(word, ja, ipa, ja_sent):
    sents = []
    for eng_t, jpn_t, cat in NOUN_TMPL:
        eng = eng_t.replace("{b}", word)
        jpn = jpn_t.replace("{m}", ja_sent)
        sents.append((eng, jpn, cat))
    return (word, ja, ipa, sents)

NEW_WORDS = []

# Additional verbs
extra_verbs = [
    ("absorb","吸収する","əbˈzɔːrb",{"3p":"absorbs","past":"absorbed","ing":"absorbing"},"吸収する"),
    ("accelerate","加速する","əkˈseləreɪt",{"3p":"accelerates","past":"accelerated","ing":"accelerating"},"加速する"),
    ("accomplish","達成する","əˈkɑːmplɪʃ",{"3p":"accomplishes","past":"accomplished","ing":"accomplishing"},"達成する"),
    ("accumulate","蓄積する","əˈkjuːmjʊleɪt",{"3p":"accumulates","past":"accumulated","ing":"accumulating"},"蓄積する"),
    ("acknowledge","認める","əkˈnɑːlɪdʒ",{"3p":"acknowledges","past":"acknowledged","ing":"acknowledging"},"認める"),
    ("acquire","取得する","əˈkwaɪər",{"3p":"acquires","past":"acquired","ing":"acquiring"},"取得する"),
    ("activate","活性化する","ˈæktɪveɪt",{"3p":"activates","past":"activated","ing":"activating"},"活性化する"),
    ("address","対処する","əˈdres",{"3p":"addresses","past":"addressed","ing":"addressing"},"対処する"),
    ("administer","管理する","ədˈmɪnɪstər",{"3p":"administers","past":"administered","ing":"administering"},"管理する"),
    ("advocate","主張する","ˈædvəkeɪt",{"3p":"advocates","past":"advocated","ing":"advocating"},"主張する"),
    ("apply","応用する","əˈplaɪ",{"3p":"applies","past":"applied","ing":"applying"},"応用する"),
    ("approve","承認する","əˈpruːv",{"3p":"approves","past":"approved","ing":"approving"},"承認する"),
    ("assign","割り当てる","əˈsaɪn",{"3p":"assigns","past":"assigned","ing":"assigning"},"割り当てる"),
    ("balance","バランスをとる","ˈbæləns",{"3p":"balances","past":"balanced","ing":"balancing"},"バランスをとる"),
    ("categorize","分類する","ˈkætɪɡəraɪz",{"3p":"categorizes","past":"categorized","ing":"categorizing"},"分類する"),
    ("commit","取り組む","kəˈmɪt",{"3p":"commits","past":"committed","ing":"committing"},"取り組む"),
    ("communicate","伝える","kəˈmjuːnɪkeɪt",{"3p":"communicates","past":"communicated","ing":"communicating"},"伝える"),
    ("compete","競争する","kəmˈpiːt",{"3p":"competes","past":"competed","ing":"competing"},"競争する"),
    ("connect","繋げる","kəˈnekt",{"3p":"connects","past":"connected","ing":"connecting"},"繋げる"),
    ("consult","相談する","kənˈsʌlt",{"3p":"consults","past":"consulted","ing":"consulting"},"相談する"),
    ("contribute","貢献する","kənˈtrɪbjuːt",{"3p":"contributes","past":"contributed","ing":"contributing"},"貢献する"),
    ("convert","変換する","kənˈvɜːrt",{"3p":"converts","past":"converted","ing":"converting"},"変換する"),
    ("customize","カスタマイズする","ˈkʌstəmaɪz",{"3p":"customizes","past":"customized","ing":"customizing"},"カスタマイズする"),
    ("develop","開発する","dɪˈveləp",{"3p":"develops","past":"developed","ing":"developing"},"開発する"),
    ("differentiate","差別化する","ˌdɪfəˈrenʃieɪt",{"3p":"differentiates","past":"differentiated","ing":"differentiating"},"差別化する"),
    ("distribute","配布する","dɪˈstrɪbjuːt",{"3p":"distributes","past":"distributed","ing":"distributing"},"配布する"),
    ("document","記録する","ˈdɑːkjʊment",{"3p":"documents","past":"documented","ing":"documenting"},"記録する"),
    ("encourage","促す","ɪnˈkɜːrɪdʒ",{"3p":"encourages","past":"encouraged","ing":"encouraging"},"促す"),
    ("establish","確立する","ɪˈstæblɪʃ",{"3p":"establishes","past":"established","ing":"establishing"},"確立する"),
    ("execute","実行する","ˈeksɪkjuːt",{"3p":"executes","past":"executed","ing":"executing"},"実行する"),
    ("fulfill","達成する","fʊlˈfɪl",{"3p":"fulfills","past":"fulfilled","ing":"fulfilling"},"達成する"),
    ("implement","実装する","ˈɪmplɪment",{"3p":"implements","past":"implemented","ing":"implementing"},"実装する"),
    ("influence","影響を与える","ˈɪnfluəns",{"3p":"influences","past":"influenced","ing":"influencing"},"影響を与える"),
    ("introduce","導入する","ˌɪntrəˈduːs",{"3p":"introduces","past":"introduced","ing":"introducing"},"導入する"),
    ("maintain","維持する","meɪnˈteɪn",{"3p":"maintains","past":"maintained","ing":"maintaining"},"維持する"),
    ("organize","整理する","ˈɔːrɡənaɪz",{"3p":"organizes","past":"organized","ing":"organizing"},"整理する"),
    ("overcome","乗り越える","ˌoʊvərˈkʌm",{"3p":"overcomes","past":"overcame","ing":"overcoming"},"乗り越える"),
    ("participate","参加する","pɑːrˈtɪsɪpeɪt",{"3p":"participates","past":"participated","ing":"participating"},"参加する"),
    ("prevent","防ぐ","prɪˈvent",{"3p":"prevents","past":"prevented","ing":"preventing"},"防ぐ"),
    ("prioritize","優先する","praɪˈɔːrɪtaɪz",{"3p":"prioritizes","past":"prioritized","ing":"prioritizing"},"優先する"),
    ("produce","生産する","prəˈduːs",{"3p":"produces","past":"produced","ing":"producing"},"生産する"),
    ("provide","提供する","prəˈvaɪd",{"3p":"provides","past":"provided","ing":"providing"},"提供する"),
    ("qualify","資格を得る","ˈkwɑːlɪfaɪ",{"3p":"qualifies","past":"qualified","ing":"qualifying"},"資格を得る"),
    ("question","問いかける","ˈkwestʃən",{"3p":"questions","past":"questioned","ing":"questioning"},"問いかける"),
    ("recommend","推薦する","ˌrekəˈmend",{"3p":"recommends","past":"recommended","ing":"recommending"},"推薦する"),
    ("require","必要とする","rɪˈkwaɪər",{"3p":"requires","past":"required","ing":"requiring"},"必要とする"),
    ("schedule","予定する","ˈskedʒuːl",{"3p":"schedules","past":"scheduled","ing":"scheduling"},"予定する"),
    ("secure","確保する","sɪˈkjʊər",{"3p":"secures","past":"secured","ing":"securing"},"確保する"),
    ("standardize","標準化する","ˈstændərdaɪz",{"3p":"standardizes","past":"standardized","ing":"standardizing"},"標準化する"),
    ("transfer","転送する","trænsˈfɜːr",{"3p":"transfers","past":"transferred","ing":"transferring"},"転送する"),
    ("verify","確認する","ˈverɪfaɪ",{"3p":"verifies","past":"verified","ing":"verifying"},"確認する"),
    ("volunteer","ボランティアをする","ˌvɑːlənˈtɪər",{"3p":"volunteers","past":"volunteered","ing":"volunteering"},"ボランティアをする"),
    ("withdraw","撤退する","wɪðˈdrɔː",{"3p":"withdraws","past":"withdrew","ing":"withdrawing"},"撤退する"),
    ("achieve","達成する","əˈtʃiːv",{"3p":"achieves","past":"achieved","ing":"achieving"},"達成する"),
    ("announce","宣言する","əˈnaʊns",{"3p":"announces","past":"announced","ing":"announcing"},"宣言する"),
    ("appreciate","感謝する","əˈpriːʃieɪt",{"3p":"appreciates","past":"appreciated","ing":"appreciating"},"感謝する"),
    ("assess","評価する","əˈses",{"3p":"assesses","past":"assessed","ing":"assessing"},"評価する"),
    ("concentrate","集中する","ˈkɑːnsəntreɪt",{"3p":"concentrates","past":"concentrated","ing":"concentrating"},"集中する"),
    ("cooperate","協力する","koʊˈɑːpəreɪt",{"3p":"cooperates","past":"cooperated","ing":"cooperating"},"協力する"),
    ("determine","決定する","dɪˈtɜːrmɪn",{"3p":"determines","past":"determined","ing":"determining"},"決定する"),
    ("expand","広げる","ɪkˈspænd",{"3p":"expands","past":"expanded","ing":"expanding"},"広げる"),
    ("identify","特定する","aɪˈdentɪfaɪ",{"3p":"identifies","past":"identified","ing":"identifying"},"特定する"),
    ("improve","向上させる","ɪmˈpruːv",{"3p":"improves","past":"improved","ing":"improving"},"向上させる"),
    ("obtain","取得する","əbˈteɪn",{"3p":"obtains","past":"obtained","ing":"obtaining"},"取得する"),
    ("purchase","購入する","ˈpɜːrtʃɪs",{"3p":"purchases","past":"purchased","ing":"purchasing"},"購入する"),
    ("recognize","認める","ˈrekəɡnaɪz",{"3p":"recognizes","past":"recognized","ing":"recognizing"},"認める"),
    ("suggest","提案する","səˈdʒest",{"3p":"suggests","past":"suggested","ing":"suggesting"},"提案する"),
    ("support","支援する","səˈpɔːrt",{"3p":"supports","past":"supported","ing":"supporting"},"支援する"),
]

# Additional adjectives
extra_adjs = [
    ("appropriate","適切な","əˈproʊpriɪt","適切な"),
    ("aware","意識している","əˈwer","意識した"),
    ("capable","有能な","ˈkeɪpəbəl","有能な"),
    ("confident","自信のある","ˈkɑːnfɪdənt","自信のある"),
    ("consistent","一貫した","kənˈsɪstənt","一貫した"),
    ("convenient","便利な","kənˈviːniənt","便利な"),
    ("correct","正しい","kəˈrekt","正しい"),
    ("creative","創造的な","kriˈeɪtɪv","創造的な"),
    ("current","現在の","ˈkɜːrənt","現在の"),
    ("effective","効果的な","ɪˈfektɪv","効果的な"),
    ("entire","全体の","ɪnˈtaɪər","全体の"),
    ("essential","必要不可欠な","ɪˈsenʃəl","不可欠な"),
    ("explicit","明示的な","ɪkˈsplɪsɪt","明示的な"),
    ("flexible","柔軟な","ˈfleksɪbəl","柔軟な"),
    ("fundamental","基礎的な","ˌfʌndəˈmentəl","基礎的な"),
    ("global","グローバルな","ˈɡloʊbəl","世界的な"),
    ("immediate","即座の","ɪˈmiːdiət","即座の"),
    ("important","重要な","ɪmˈpɔːrtənt","重要な"),
    ("independent","独立した","ˌɪndɪˈpendənt","独立した"),
    ("individual","個別の","ˌɪndɪˈvɪdʒuəl","個別の"),
    ("maximum","最大の","ˈmæksɪməm","最大の"),
    ("minimum","最小の","ˈmɪnɪməm","最小の"),
    ("necessary","必要な","ˈnesɪseri","必要な"),
    ("negative","否定的な","ˈneɡətɪv","否定的な"),
    ("numerous","多数の","ˈnjuːmərəs","多数の"),
    ("obvious","明らかな","ˈɑːbviəs","明らかな"),
    ("ordinary","普通の","ˈɔːrdɪneri","普通の"),
    ("particular","特定の","pərˈtɪkjʊlər","特定の"),
    ("permanent","永続的な","ˈpɜːrmənənt","永続的な"),
    ("positive","積極的な","ˈpɑːzɪtɪv","積極的な"),
    ("potential","潜在的な","pəˈtenʃəl","潜在的な"),
    ("previous","前の","ˈpriːviəs","前の"),
    ("primary","主要な","ˈpraɪmeri","主要な"),
    ("reasonable","合理的な","ˈriːzənəbəl","合理的な"),
    ("regular","定期的な","ˈreɡjʊlər","定期的な"),
    ("relevant","関連した","ˈreləvənt","関連した"),
    ("reliable","信頼できる","rɪˈlaɪəbəl","信頼できる"),
    ("responsible","責任ある","rɪˈspɑːnsɪbəl","責任ある"),
    ("significant","重要な","sɪɡˈnɪfɪkənt","重要な"),
    ("similar","類似した","ˈsɪmɪlər","類似した"),
    ("specific","具体的な","spɪˈsɪfɪk","具体的な"),
    ("successful","成功した","səkˈsesfəl","成功した"),
    ("sufficient","十分な","səˈfɪʃənt","十分な"),
    ("temporary","一時的な","ˈtempəreri","一時的な"),
    ("various","様々な","ˈveriəs","様々な"),
]

# Additional nouns
extra_nouns = [
    ("approach","アプローチ","əˈproʊtʃ","アプローチ"),
    ("benefit","利益","ˈbenɪfɪt","利益"),
    ("challenge","挑戦","ˈtʃælɪndʒ","挑戦"),
    ("community","コミュニティ","kəˈmjuːnɪti","コミュニティ"),
    ("concern","懸念","kənˈsɜːrn","懸念"),
    ("environment","環境","ɪnˈvaɪrənmənt","環境"),
    ("experience","経験","ɪkˈspɪriəns","経験"),
    ("individual","個人","ˌɪndɪˈvɪdʒuəl","個人"),
    ("influence","影響","ˈɪnfluəns","影響"),
    ("opportunity","チャンス","ˌɑːpərˈtuːnɪti","チャンス"),
    ("priority","優先事項","praɪˈɔːrɪti","優先事項"),
    ("progress","進捗","ˈprɑːɡres","進捗"),
    ("resource","リソース","ˈriːsɔːrs","リソース"),
    ("response","反応","rɪˈspɑːns","反応"),
    ("situation","状況","ˌsɪtʃuˈeɪʃən","状況"),
    ("standard","標準","ˈstændərd","標準"),
    ("strategy","戦略","ˈstrætɪdʒi","戦略"),
    ("success","成功","səkˈses","成功"),
    ("support","支援","səˈpɔːrt","支援"),
    ("tradition","伝統","trəˈdɪʃən","伝統"),
    ("accuracy","正確さ","ˈækjərəsi","正確さ"),
    ("achievement","業績","əˈtʃiːvmənt","業績"),
    ("barrier","障壁","ˈbæriər","障壁"),
    ("clarity","明瞭さ","ˈklærɪti","明瞭さ"),
    ("competence","能力","ˈkɑːmpɪtəns","能力"),
    ("complexity","複雑性","kəmˈpleksɪti","複雑性"),
    ("consistency","一貫性","kənˈsɪstənsi","一貫性"),
    ("creativity","創造力","ˌkriːeɪˈtɪvɪti","創造力"),
    ("efficiency","効率性","ɪˈfɪʃənsi","効率性"),
    ("expectation","予想","ˌekspekˈteɪʃən","予想"),
    ("flexibility","融通性","ˌfleksɪˈbɪlɪti","融通性"),
    ("guidance","ガイダンス","ˈɡaɪdəns","ガイダンス"),
    ("habit","習慣","ˈhæbɪt","習慣"),
    ("initiative","イニシアチブ","ɪˈnɪʃətɪv","イニシアチブ"),
    ("insight","洞察","ˈɪnsaɪt","洞察"),
    ("integrity","誠実","ɪnˈteɡrɪti","誠実"),
    ("mindset","考え方","ˈmaɪndset","考え方"),
    ("obstacle","障害","ˈɑːbstəkəl","障害"),
    ("outcome","成果","ˈaʊtkʌm","成果"),
    ("ownership","責任感","ˈoʊnərʃɪp","責任感"),
    ("patience","忍耐","ˈpeɪʃəns","忍耐"),
    ("perspective","見方","pərˈspektɪv","見方"),
    ("potential","潜在力","pəˈtenʃəl","潜在力"),
    ("resilience","粘り強さ","rɪˈzɪliəns","粘り強さ"),
    ("responsibility","責任","rɪˌspɑːnsɪˈbɪlɪti","責任"),
    ("transparency","透明さ","trænsˈpærənsi","透明さ"),
    ("trust","信頼","trʌst","信頼"),
    ("urgency","緊急性","ˈɜːrdʒənsi","緊急性"),
    ("vision","目標","ˈvɪʒən","目標"),
]

for w, ja, ipa, forms, ja_sent in extra_verbs:
    NEW_WORDS.append(make_verb(w, ja, ipa, forms, ja_sent))

for w, ja, ipa, ja_sent in extra_adjs:
    NEW_WORDS.append(make_adj(w, ja, ipa, ja_sent))

for w, ja, ipa, ja_sent in extra_nouns:
    NEW_WORDS.append(make_noun(w, ja, ipa, ja_sent))

try:
    with EXISTING_FILE.open('r', encoding='utf-8') as f:
        data = json.load(f)
except FileNotFoundError:
    print(f"Error: {EXISTING_FILE} not found")
    sys.exit(1)
except json.JSONDecodeError as e:
    print(f"Error: Invalid JSON in {EXISTING_FILE}: {e}")
    sys.exit(1)

existing_count = len(data['words'])
existing_words_set = {w['word'] for w in data['words']}

unique_new = []
seen = set()
for entry in NEW_WORDS:
    w = entry[0]
    if w not in existing_words_set and w not in seen:
        unique_new.append(entry)
        seen.add(w)

print(f"Unique new words to add: {len(unique_new)}")

for i, (word, meaning, phonetic, sentences) in enumerate(unique_new):
    n = existing_count + i + 1
    word_id = f"3000{n:04d}-{n:04d}-{n:04d}-{n:04d}-{n:012d}"
    sentence_entries = [
        {
            "id": f"3000{n:04d}-{n:04d}-{n:04d}-{n:04d}-{j+1:012d}",
            "english": eng,
            "japanese": jpn,
            "category": cat
        }
        for j, (eng, jpn, cat) in enumerate(sentences)
    ]
    data['words'].append({
        "id": word_id,
        "word": word,
        "meaning": meaning,
        "phonetic": phonetic,
        "sentences": sentence_entries,
        "createdAt": BASE_TIMESTAMP + (existing_count + i + 1) * 3600
    })

total = len(data['words'])
with EXISTING_FILE.open('w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"Done. Total words: {total}")
