(() => {
    let allQuestions = window.SIMULADO_QUESTIONS;

        /* ==========================================================================
           APPLICATION STATE MANAGEMENT (LocalStorage Persistence)
           ========================================================================== */
        const STORAGE_KEY = 'simulado_tgp_fgv_v2_state';

        let state = {
            currentIndex: 0, // 0-based index for q1 to q100
            answers: {}, // { [qId]: { selectedLetter: 'A', isCorrect: true, timestamp: 123 } }
            markedQuestions: [],
            filterGrid: 'all',
            filterTopic: 'all',
            reviewFilter: 'wrong',
            reviewTopic: 'all'
        };

        // Load state from localStorage on init
        function loadSavedState() {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed && typeof parsed.currentIndex === 'number') {
                        state.currentIndex = Math.max(0, Math.min(allQuestions.length - 1, parsed.currentIndex));
                        state.answers = parsed.answers && typeof parsed.answers === 'object' ? parsed.answers : {};
                        state.markedQuestions = Array.isArray(parsed.markedQuestions)
                            ? parsed.markedQuestions.filter(id => allQuestions.some(question => question.id === id))
                            : [];

                        if (Array.isArray(parsed.questionLayout)) {
                            const savedLayout = new Map(parsed.questionLayout.map(question => [question.id, question]));
                            allQuestions = allQuestions.map(question => {
                                const savedQuestion = savedLayout.get(question.id);
                                return savedQuestion && Array.isArray(savedQuestion.options)
                                    ? { ...question, options: savedQuestion.options, correctLetter: savedQuestion.correctLetter }
                                    : question;
                            });
                        }
                    }
                }
            } catch (e) {
                console.error("Erro ao carregar do localStorage", e);
            }
        }

        // Save state to localStorage
        function saveState() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    currentIndex: state.currentIndex,
                    answers: state.answers,
                    markedQuestions: state.markedQuestions,
                    questionLayout: allQuestions.map(({ id, options, correctLetter }) => ({ id, options, correctLetter }))
                }));
            } catch (e) {
                console.error("Erro ao salvar no localStorage", e);
            }
        }

        /* ==========================================================================
           UI RENDERING & DOM MANIPULATION
           ========================================================================== */
        document.addEventListener('DOMContentLoaded', () => {
            loadSavedState();
            initUI();
            renderCurrentQuestion();
            updateDashboardStats();
        });

        function initUI() {
            // Lucide Icons Render
            lucide.createIcons();

            // Setup Event Listeners
            document.getElementById('btn-prev').addEventListener('click', navigatePrev);
            document.getElementById('btn-next').addEventListener('click', navigateNext);
            document.getElementById('btn-submit').addEventListener('click', submitAnswer);
            document.getElementById('btn-mark-review').addEventListener('click', toggleCurrentQuestionMark);
            document.getElementById('btn-open-review').addEventListener('click', openReviewModal);
            document.getElementById('btn-close-review').addEventListener('click', closeReviewModal);
            document.getElementById('btn-review-close-bottom').addEventListener('click', closeReviewModal);
            document.getElementById('modal-review').addEventListener('click', event => {
                if (event.target === event.currentTarget) closeReviewModal();
            });
            document.getElementById('grid-topic-filter').addEventListener('change', event => {
                state.filterTopic = event.target.value;
                renderGridModalNumbers();
            });
            document.getElementById('review-topic-filter').addEventListener('change', event => {
                state.reviewTopic = event.target.value;
                renderReviewList();
            });
            document.querySelectorAll('.review-filter-btn').forEach(button => {
                button.addEventListener('click', () => {
                    state.reviewFilter = button.dataset.reviewFilter;
                    document.querySelectorAll('.review-filter-btn').forEach(filterButton => {
                        const active = filterButton === button;
                        filterButton.classList.toggle('bg-slate-800', active);
                        filterButton.classList.toggle('text-white', active);
                        filterButton.classList.toggle('border', !active);
                        filterButton.classList.toggle('border-slate-700', !active);
                        filterButton.classList.toggle('text-slate-300', !active);
                    });
                    renderReviewList();
                });
            });

            // Modal Grid
            document.getElementById('btn-open-grid').addEventListener('click', openGridModal);
            document.getElementById('btn-close-grid').addEventListener('click', closeGridModal);
            document.getElementById('btn-close-grid-bottom').addEventListener('click', closeGridModal);

            // Reset Modal
            document.getElementById('btn-reset-simulado').addEventListener('click', () => {
                document.getElementById('modal-confirm-reset').classList.remove('hidden');
            });
            document.getElementById('btn-cancel-reset').addEventListener('click', () => {
                document.getElementById('modal-confirm-reset').classList.add('hidden');
            });
            document.getElementById('btn-confirm-reset').addEventListener('click', resetSimulado);

            // Results Screen actions
            document.getElementById('btn-restart-simulado-final').addEventListener('click', resetSimulado);
            document.getElementById('btn-review-all').addEventListener('click', () => {
                document.getElementById('results-screen').classList.add('hidden');
                document.getElementById('question-card').classList.remove('hidden');
                state.currentIndex = 0;
                renderCurrentQuestion();
            });
            document.getElementById('btn-toggle-review').addEventListener('click', () => {
                navigateToNextQuestion(question => state.answers[question.id] && !state.answers[question.id].isCorrect);
            });

            // Filter Buttons inside Grid Modal
            document.querySelectorAll('.grid-filter-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.grid-filter-btn').forEach(b => {
                        b.classList.remove('bg-slate-800', 'text-slate-200');
                        b.classList.add('text-slate-400');
                    });
                    btn.classList.add('bg-slate-800', 'text-slate-200');
                    btn.classList.remove('text-slate-400');
                    state.filterGrid = btn.getAttribute('data-grid-filter');
                    renderGridModalNumbers();
                });
            });
            document.addEventListener('keydown', handleKeyboardShortcuts);
            populateTopicFilters();
        }

        // Render current active question
        function renderCurrentQuestion() {
            const q = allQuestions[state.currentIndex];
            if (!q) return;
            currentlySelectedLetter = null;

            // Update question badges and meta
            document.getElementById('badge-qnum').innerText = `Questão ${q.id} de 100`;
            document.getElementById('badge-level').innerText = `Nível ${q.level}`;
            document.getElementById('topic-text').innerText = q.topic;
            document.getElementById('question-text').innerText = `${q.id}. ${q.question}`;
            updateCurrentQuestionMarkButton(q.id);

            // Check if already answered
            const previousAnswer = state.answers[q.id];

            // Options container
            const container = document.getElementById('options-container');
            container.innerHTML = '';

            q.options.forEach(opt => {
                const optionBtn = document.createElement('button');
                optionBtn.type = 'button';
                optionBtn.setAttribute('aria-pressed', 'false');
                optionBtn.className = `w-full text-left p-4 rounded-xl border transition-all duration-200 flex items-start space-x-3 group relative overflow-hidden ${
          previousAnswer ? 'cursor-default' : 'hover:border-brand-500/80 hover:bg-slate-800/60'
        }`;

                // Base Styling
                let optionBgClass = 'bg-slate-950/60 border-slate-800 text-slate-200';
                let badgeStyle =
                    'bg-slate-800 text-slate-300 border-slate-700 group-hover:bg-brand-600 group-hover:text-white';

                if (previousAnswer) {
                    if (opt.letter === q.correctLetter) {
                        // Correct option highlight
                        optionBgClass =
                            'bg-emerald-950/50 border-emerald-500/80 text-emerald-100 ring-1 ring-emerald-500/50';
                        badgeStyle = 'bg-emerald-600 text-white border-emerald-400';
                    } else if (previousAnswer.selectedLetter === opt.letter) {
                        // Wrong chosen option highlight
                        optionBgClass =
                            'bg-rose-950/50 border-rose-500/80 text-rose-100 ring-1 ring-rose-500/50';
                        badgeStyle = 'bg-rose-600 text-white border-rose-400';
                    } else {
                        optionBgClass = 'bg-slate-950/30 border-slate-900 text-slate-500 opacity-60';
                        badgeStyle = 'bg-slate-900 text-slate-600 border-slate-800';
                    }
                }

                optionBtn.className += ` ${optionBgClass}`;
                optionBtn.setAttribute('data-letter', opt.letter);

                optionBtn.innerHTML = `
          <span class="px-2.5 py-1 rounded-lg border text-xs font-bold transition ${badgeStyle}">
            ${opt.letter}
          </span>
          <span class="text-sm sm:text-base leading-relaxed pt-0.5 flex-1 font-normal">${opt.text}</span>
        `;

                if (!previousAnswer) {
                    optionBtn.addEventListener('click', () => selectOption(opt.letter));
                }

                container.appendChild(optionBtn);
            });

            // Feedback Box setup
            const feedbackBox = document.getElementById('feedback-box');
            const btnSubmit = document.getElementById('btn-submit');
            const btnNext = document.getElementById('btn-next');

            if (previousAnswer) {
                btnSubmit.classList.add('hidden');
                btnNext.classList.remove('hidden');

                // Display Feedback
                feedbackBox.classList.remove('hidden');
                if (previousAnswer.isCorrect) {
                    feedbackBox.className =
                    'mt-6 p-5 rounded-xl border bg-emerald-950/40 border-emerald-500/50 text-emerald-100 shadow-lg shadow-emerald-900/20';
                    document.getElementById('feedback-icon').className =
                        'p-2 rounded-lg bg-emerald-500/20 text-emerald-400';
                    document.getElementById('feedback-icon').innerHTML =
                        '<i data-lucide="check-circle" class="w-6 h-6"></i>';
                    document.getElementById('feedback-title').innerText = 'RESPOSTA CORRETA!';
                    document.getElementById('feedback-subtitle').innerText =
                        `Parabéns! Você assinalou a alternativa correta (${q.correctLetter}).`;
                } else {
                    feedbackBox.className =
                    'mt-6 p-5 rounded-xl border bg-rose-950/40 border-rose-500/50 text-rose-100 shadow-lg shadow-rose-900/20';
                    document.getElementById('feedback-icon').className = 'p-2 rounded-lg bg-rose-500/20 text-rose-400';
                    document.getElementById('feedback-icon').innerHTML =
                        '<i data-lucide="x-circle" class="w-6 h-6"></i>';
                    document.getElementById('feedback-title').innerText = 'RESPOSTA INCORRETA';
                    document.getElementById('feedback-subtitle').innerText =
                        `Sua escolha: ${previousAnswer.selectedLetter} | Alternativa correta: ${q.correctLetter}`;
                }
                document.getElementById('feedback-explanation').innerText = q.explanation;
            } else {
            feedbackBox.className = 'hidden';
                btnSubmit.classList.remove('hidden');
                btnSubmit.disabled = true;
                btnNext.classList.add('hidden');
            }

            // Prev Button State
            document.getElementById('btn-prev').disabled = (state.currentIndex === 0);

            // Re-init icons
            lucide.createIcons();
            saveState();
        }

        // Select an Option visually
        let currentlySelectedLetter = null;

        function selectOption(letter) {
            if (state.answers[allQuestions[state.currentIndex].id]) return; // Already answered

            currentlySelectedLetter = letter;
            const options = document.querySelectorAll('#options-container button');
            options.forEach(btn => {
                const btnLetter = btn.getAttribute('data-letter');
                const baseClass = 'bg-slate-950/60 border-slate-800 text-slate-200';
                const selectedClass = 'bg-brand-950/60 border-brand-500 text-white ring-2 ring-brand-500/50 shadow-lg shadow-brand-500/10';

                btn.className = btn.className
                    .replace(baseClass, btnLetter === letter ? selectedClass : baseClass)
                    .replace(selectedClass, btnLetter === letter ? selectedClass : baseClass);

                if (btnLetter !== letter) {
                    btn.className = btn.className.replace('shadow-lg shadow-brand-500/10', '');
                }
                btn.setAttribute('aria-pressed', String(btnLetter === letter));
            });

            document.getElementById('btn-submit').disabled = false;
        }

        function isQuestionMarked(questionId) {
            return state.markedQuestions.includes(questionId);
        }

        function updateCurrentQuestionMarkButton(questionId) {
            const button = document.getElementById('btn-mark-review');
            const marked = isQuestionMarked(questionId);
            button.setAttribute('aria-pressed', String(marked));
            button.classList.toggle('border-amber-500/60', marked);
            button.classList.toggle('bg-amber-500/10', marked);
            button.classList.toggle('text-amber-200', marked);
            button.classList.toggle('text-slate-300', !marked);
            button.innerHTML = `<i data-lucide="${marked ? 'bookmark-check' : 'bookmark'}" class="w-3.5 h-3.5"></i><span>${marked ? 'Marcada para revisão' : 'Marcar revisão'}</span>`;
            lucide.createIcons();
        }

        function toggleCurrentQuestionMark() {
            const questionId = allQuestions[state.currentIndex].id;
            if (isQuestionMarked(questionId)) {
                state.markedQuestions = state.markedQuestions.filter(id => id !== questionId);
            } else {
                state.markedQuestions.push(questionId);
            }
            updateCurrentQuestionMarkButton(questionId);
            updateDashboardStats();
            renderGridModalNumbers();
            saveState();
        }

        function handleKeyboardShortcuts(event) {
            if (event.key === 'Escape') {
                closeGridModal();
                closeReviewModal();
                document.getElementById('modal-confirm-reset').classList.add('hidden');
                return;
            }

            const target = event.target;
            const isTyping = target instanceof HTMLElement &&
                (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
            const isOverlayOpen = !document.getElementById('modal-grid').classList.contains('hidden') ||
                !document.getElementById('modal-review').classList.contains('hidden') ||
                !document.getElementById('modal-confirm-reset').classList.contains('hidden');
            if (isTyping || isOverlayOpen || document.getElementById('question-card').classList.contains('hidden')) return;

            if (/^[a-d]$/i.test(event.key)) {
                const selected = event.key.toUpperCase();
                if (allQuestions[state.currentIndex].options.some(option => option.letter === selected)) {
                    selectOption(selected);
                }
            } else if (event.key === 'Enter' && currentlySelectedLetter) {
                submitAnswer();
            }
        }

        function navigateToNextQuestion(matchesQuestion) {
            for (let offset = 1; offset <= allQuestions.length; offset += 1) {
                const index = (state.currentIndex + offset) % allQuestions.length;
                if (matchesQuestion(allQuestions[index])) {
                    state.currentIndex = index;
                    renderCurrentQuestion();
                    return true;
                }
            }
            return false;
        }

        // Submit Answer
        function submitAnswer() {
            if (!currentlySelectedLetter) return;

            const q = allQuestions[state.currentIndex];
            const isCorrect = (currentlySelectedLetter === q.correctLetter);

            state.answers[q.id] = {
                selectedLetter: currentlySelectedLetter,
                isCorrect: isCorrect,
                timestamp: Date.now()
            };

            currentlySelectedLetter = null;
            renderCurrentQuestion();
            updateDashboardStats();

            // Check if all 100 questions are completed
            if (Object.keys(state.answers).length === 100) {
                showResultsScreen();
            }
        }

        // Navigation
        function navigatePrev() {
            if (state.currentIndex > 0) {
                state.currentIndex--;
                renderCurrentQuestion();
            }
        }

        function navigateNext() {
            if (state.currentIndex < 99) {
                state.currentIndex++;
                renderCurrentQuestion();
            } else {
                showResultsScreen();
            }
        }

        // Update Dashboard Metrics
        function updateDashboardStats() {
            const totalAnswered = Object.keys(state.answers).length;
            let hits = 0;
            let misses = 0;

            Object.values(state.answers).forEach(ans => {
                if (ans.isCorrect) hits++;
                else misses++;
            });

            const hitsPct = ((hits / allQuestions.length) * 100).toFixed(1);
            const missesPct = ((misses / allQuestions.length) * 100).toFixed(1);
            const overallYield = totalAnswered > 0 ? Math.round((hits / totalAnswered) * 100) : 0;

            document.getElementById('stat-current-num').innerText = state.currentIndex + 1;
            document.getElementById('stat-hits').innerText = hits;
            document.getElementById('stat-hits-pct').innerText = `${hitsPct}% do total`;
            document.getElementById('stat-misses').innerText = misses;
            document.getElementById('stat-misses-pct').innerText = `${missesPct}% do total`;
            document.getElementById('stat-yield').innerText = `${overallYield}%`;
            document.getElementById('stat-yield-bar').style.width = `${Math.min(overallYield, 100)}%`;

            const topPct = (totalAnswered / 100) * 100;
            document.getElementById('top-progress-bar').style.width = `${topPct}%`;
            document.getElementById('header-progress-text').innerText = `${totalAnswered}/100`;
            document.getElementById('btn-toggle-review').textContent = `Próximo erro · ${misses}`;
            document.getElementById('btn-toggle-review').disabled = misses === 0;
            document.getElementById('btn-toggle-review').classList.toggle('opacity-50', misses === 0);
            document.getElementById('btn-toggle-review').classList.toggle('cursor-not-allowed', misses === 0);
            const reviewCount = allQuestions.filter(question =>
                (state.answers[question.id] && !state.answers[question.id].isCorrect) || isQuestionMarked(question.id)
            ).length;
            document.getElementById('review-count').textContent = reviewCount;
            document.getElementById('btn-open-review').setAttribute(
                'aria-label',
                `Abrir central de revisão com ${reviewCount} ${reviewCount === 1 ? 'questão' : 'questões'}`
            );
            updateTopicPerformance();
        }

        function populateTopicFilters() {
            const topics = [...new Set(allQuestions.map(question => question.topic))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
            ['grid-topic-filter', 'review-topic-filter'].forEach(id => {
                const select = document.getElementById(id);
                topics.forEach(topic => {
                    const option = document.createElement('option');
                    option.value = topic;
                    option.textContent = topic;
                    select.appendChild(option);
                });
            });
        }

        function updateTopicPerformance() {
            const container = document.getElementById('topic-performance');
            const summary = document.getElementById('topic-performance-summary');
            const topics = new Map();

            allQuestions.forEach(question => {
                const topic = topics.get(question.topic) || { total: 0, answered: 0, hits: 0 };
                const answer = state.answers[question.id];
                topic.total += 1;
                if (answer) {
                    topic.answered += 1;
                    if (answer.isCorrect) topic.hits += 1;
                }
                topics.set(question.topic, topic);
            });

            const practicedTopics = [...topics.entries()]
                .filter(([, stats]) => stats.answered > 0)
                .sort((first, second) => {
                    const firstRate = first[1].hits / first[1].answered;
                    const secondRate = second[1].hits / second[1].answered;
                    return firstRate - secondRate || second[1].answered - first[1].answered;
                })
                .slice(0, 5);

            summary.textContent = practicedTopics.length
                ? `${practicedTopics.length} assunto${practicedTopics.length === 1 ? '' : 's'} em foco`
                : 'Responda para ver';
            container.replaceChildren();

            if (!practicedTopics.length) {
                const emptyState = document.createElement('p');
                emptyState.className = 'text-xs text-slate-500 leading-relaxed';
                emptyState.textContent = 'Seu aproveitamento por assunto aparecerá conforme você responder às questões.';
                container.appendChild(emptyState);
                return;
            }

            practicedTopics.forEach(([name, stats]) => {
                const percentage = Math.round((stats.hits / stats.answered) * 100);
                const item = document.createElement('div');
                item.className = 'rounded-lg bg-slate-950/50 border border-slate-800/70 p-2';
                const titleRow = document.createElement('div');
                titleRow.className = 'flex items-center justify-between gap-2 mb-1';
                const title = document.createElement('span');
                title.className = 'text-[11px] text-slate-300 truncate';
                title.textContent = name;
                title.title = name;
                const score = document.createElement('span');
                score.className = `text-[11px] font-semibold ${percentage >= 70 ? 'text-emerald-300' : 'text-amber-300'}`;
                score.textContent = `${percentage}%`;
                titleRow.append(title, score);

                const track = document.createElement('div');
                track.className = 'h-1.5 rounded-full bg-slate-800 overflow-hidden';
                const bar = document.createElement('div');
                bar.className = `h-full ${percentage >= 70 ? 'bg-emerald-500' : 'bg-amber-500'}`;
                bar.style.width = `${percentage}%`;
                track.appendChild(bar);

                const details = document.createElement('div');
                details.className = 'mt-1 text-[10px] text-slate-500';
                details.textContent = `${stats.hits}/${stats.answered} corretas · ${stats.answered}/${stats.total} respondidas`;
                item.append(titleRow, track, details);
                container.appendChild(item);
            });
        }

        // Grid Modal Render
        function openGridModal() {
            renderGridModalNumbers();
            document.getElementById('modal-grid').classList.remove('hidden');
        }

        function closeGridModal() {
            document.getElementById('modal-grid').classList.add('hidden');
        }

        function openReviewModal() {
            document.getElementById('modal-review').classList.remove('hidden');
            renderReviewList();
            document.getElementById('btn-close-review').focus();
        }

        function closeReviewModal() {
            document.getElementById('modal-review').classList.add('hidden');
        }

        function renderReviewList() {
            const list = document.getElementById('review-list');
            list.replaceChildren();
            const wrongCount = allQuestions.filter(question => state.answers[question.id] && !state.answers[question.id].isCorrect).length;
            const markedCount = state.markedQuestions.length;
            const answeredCount = Object.keys(state.answers).length;
            document.getElementById('review-wrong-count').textContent = wrongCount;
            document.getElementById('review-marked-count').textContent = markedCount;
            document.getElementById('review-answered-count').textContent = answeredCount;

            const questions = allQuestions.filter(question => {
                const answer = state.answers[question.id];
                const isWrong = answer && !answer.isCorrect;
                const isMarked = isQuestionMarked(question.id);
                const matchesFilter = state.reviewFilter === 'wrong'
                    ? isWrong
                    : state.reviewFilter === 'marked'
                        ? isMarked
                        : Boolean(answer);
                return matchesFilter && (state.reviewTopic === 'all' || question.topic === state.reviewTopic);
            });

            document.getElementById('review-list-summary').textContent =
                `${questions.length} ${questions.length === 1 ? 'questão' : 'questões'} nesta lista`;

            if (!questions.length) {
                const emptyState = document.createElement('div');
                emptyState.className = 'rounded-xl border border-slate-800 bg-slate-950/40 px-5 py-10 text-center';
                const heading = document.createElement('h3');
                heading.className = 'text-sm font-semibold text-slate-200';
                heading.textContent = state.reviewFilter === 'wrong'
                    ? 'Nenhuma questão errada para revisar'
                    : state.reviewFilter === 'marked'
                        ? 'Nenhuma questão marcada'
                        : 'Você ainda não respondeu questões';
                const message = document.createElement('p');
                message.className = 'mt-2 text-xs text-slate-500';
                message.textContent = 'Responda ao simulado ou marque questões para encontrá-las aqui.';
                emptyState.append(heading, message);
                list.appendChild(emptyState);
                return;
            }

            questions.forEach(question => {
                const answer = state.answers[question.id];
                const card = document.createElement('article');
                card.className = 'rounded-xl border border-slate-800 bg-slate-950/50 p-4 sm:p-5';
                const header = document.createElement('div');
                header.className = 'flex flex-wrap items-center justify-between gap-2';
                const number = document.createElement('h3');
                number.className = 'text-sm font-bold text-white';
                number.textContent = `Questão ${question.id}`;
                const badges = document.createElement('div');
                badges.className = 'flex flex-wrap items-center gap-2';
                const topic = document.createElement('span');
                topic.className = 'rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] text-slate-300';
                topic.textContent = question.topic;
                badges.appendChild(topic);
                if (isQuestionMarked(question.id)) {
                    const marked = document.createElement('span');
                    marked.className = 'rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200';
                    marked.textContent = 'Marcada';
                    badges.appendChild(marked);
                }
                header.append(number, badges);

                const prompt = document.createElement('p');
                prompt.className = 'mt-3 text-sm leading-relaxed text-slate-200';
                prompt.textContent = question.question;
                const answers = document.createElement('p');
                answers.className = `mt-3 text-xs ${answer && answer.isCorrect ? 'text-emerald-300' : 'text-rose-300'}`;
                answers.textContent = answer
                    ? `Sua resposta: ${answer.selectedLetter} · Gabarito: ${question.correctLetter}`
                    : `Gabarito: ${question.correctLetter} · Ainda não respondida`;

                const explanation = document.createElement('p');
                explanation.className = 'mt-2 border-t border-slate-800 pt-3 text-xs leading-relaxed text-slate-400';
                explanation.textContent = question.explanation;
                const actions = document.createElement('div');
                actions.className = 'mt-4 flex justify-end';
                const openButton = document.createElement('button');
                openButton.type = 'button';
                openButton.className = 'rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-2 text-xs font-semibold text-brand-200 transition hover:bg-brand-500/20';
                openButton.textContent = 'Abrir questão';
                openButton.addEventListener('click', () => {
                    state.currentIndex = allQuestions.findIndex(item => item.id === question.id);
                    document.getElementById('results-screen').classList.add('hidden');
                    document.getElementById('question-card').classList.remove('hidden');
                    closeReviewModal();
                    renderCurrentQuestion();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                });
                actions.appendChild(openButton);
                card.append(header, prompt, answers, explanation, actions);
                list.appendChild(card);
            });
        }

        function renderGridModalNumbers() {
            const container = document.getElementById('grid-numbers-container');
            container.innerHTML = '';

            allQuestions.forEach((q, idx) => {
                const ans = state.answers[q.id];

                if (state.filterGrid === 'answered' && !ans) return;
                if (state.filterGrid === 'unanswered' && ans) return;
                if (state.filterGrid === 'marked' && !isQuestionMarked(q.id)) return;
                if (state.filterTopic !== 'all' && q.topic !== state.filterTopic) return;

                const btn = document.createElement('button');
                let btnStyle = 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600 hover:bg-slate-800';

                if (ans) {
                    if (ans.isCorrect) {
                        btnStyle = 'bg-emerald-950/80 border-emerald-500/80 text-emerald-300 font-bold';
                    } else {
                        btnStyle = 'bg-rose-950/80 border-rose-500/80 text-rose-300 font-bold';
                    }
                }

                if (idx === state.currentIndex) {
                    btnStyle += ' ring-2 ring-brand-400 ring-offset-2 ring-offset-slate-950';
                }

                btn.className = `p-2.5 text-xs font-mono rounded-lg border flex flex-col items-center justify-center transition ${btnStyle}`;
                btn.textContent = q.id;
                btn.title = `Questão ${q.id}${isQuestionMarked(q.id) ? ' · marcada para revisão' : ''}`;
                btn.setAttribute('aria-label', `Questão ${q.id}${ans ? (ans.isCorrect ? ', correta' : ', incorreta') : ', não respondida'}${isQuestionMarked(q.id) ? ', marcada para revisão' : ''}`);
                if (isQuestionMarked(q.id)) {
                    btn.classList.add('ring-1', 'ring-amber-400/70');
                }

                btn.addEventListener('click', () => {
                    state.currentIndex = idx;
                    renderCurrentQuestion();
                    closeGridModal();
                });

                container.appendChild(btn);
            });
            if (!container.childElementCount) {
                const emptyState = document.createElement('p');
                emptyState.className = 'col-span-full py-10 text-center text-sm text-slate-500';
                emptyState.textContent = 'Nenhuma questão neste filtro.';
                container.appendChild(emptyState);
            }
            document.getElementById('grid-summary').textContent =
                `${Object.keys(state.answers).length} respondidas · ${state.markedQuestions.length} marcadas`;
        }

        // Reset Simulado
        function resetSimulado() {
            state.currentIndex = 0;
            state.answers = {};
            state.markedQuestions = [];
            currentlySelectedLetter = null;
            localStorage.removeItem(STORAGE_KEY);

            document.getElementById('modal-confirm-reset').classList.add('hidden');
            document.getElementById('results-screen').classList.add('hidden');
            document.getElementById('question-card').classList.remove('hidden');

            renderCurrentQuestion();
            updateDashboardStats();
        }

        // Show Final Results Screen
        function showResultsScreen() {
            document.getElementById('question-card').classList.add('hidden');
            document.getElementById('results-screen').classList.remove('hidden');

            const totalAnswered = Object.keys(state.answers).length;
            let hits = 0;
            Object.values(state.answers).forEach(ans => {
                if (ans.isCorrect) hits++;
            });
            const misses = totalAnswered - hits;
            const yieldPct = totalAnswered > 0 ? Math.round((hits / totalAnswered) * 100) : 0;

            document.getElementById('res-hits').innerText = hits;
            document.getElementById('res-misses').innerText = misses;
            document.getElementById('res-yield').innerText = `${yieldPct}%`;

            const msgBox = document.getElementById('res-message-box');
            if (yieldPct >= 80) {
                msgBox.className =
                    'p-5 rounded-xl border bg-emerald-950/40 border-emerald-500/50 text-emerald-200 max-w-2xl mx-auto text-left';
                msgBox.innerHTML = `
          <h4 class="font-bold text-base flex items-center gap-2"><i data-lucide="award" class="w-5 h-5"></i> EXCELENTE DESEMPENHO!</h4>
          <p class="text-xs mt-1 leading-relaxed">Você atingiu a marca de ${yieldPct}% de aproveitamento. Seu nível de conhecimento no padrão FGV para Teoria Geral do Processo está altamente competitivo para o Exame de Ordem e principais concursos públicos.</p>
        `;
            } else if (yieldPct >= 60) {
                msgBox.className =
                    'p-5 rounded-xl border bg-amber-950/40 border-amber-500/50 text-amber-200 max-w-2xl mx-auto text-left';
                msgBox.innerHTML = `
          <h4 class="font-bold text-base flex items-center gap-2"><i data-lucide="check-circle-2" class="w-5 h-5"></i> BOM DESEMPENHO!</h4>
          <p class="text-xs mt-1 leading-relaxed">Você obteve ${yieldPct}% de aproveitamento. É uma pontuação sólida, mas sugerimos revisar as questões incorretas para consolidar pontos conceituais de arbitragem e princípios processuais.</p>
        `;
            } else {
                msgBox.className =
                    'p-5 rounded-xl border bg-rose-950/40 border-rose-500/50 text-rose-200 max-w-2xl mx-auto text-left';
                msgBox.innerHTML = `
          <h4 class="font-bold text-base flex items-center gap-2"><i data-lucide="alert-circle" class="w-5 h-5"></i> REVISÃO RECOMENDADA</h4>
          <p class="text-xs mt-1 leading-relaxed">Você atingiu ${yieldPct}% de aproveitamento. Recomendamos refazer o simulado e revisar atentamente os comentários didáticos das questões incorretas.</p>
        `;
            }
            lucide.createIcons();
        }
})();
