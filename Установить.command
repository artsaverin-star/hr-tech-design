#!/bin/bash
# Двойной клик по этому файлу запускает установку HR TECH DESIGN.
# Если macOS говорит «неизвестный разработчик» — правый клик по файлу → Open.
curl -fsSL https://raw.githubusercontent.com/artsaverin-star/hr-tech-design/main/install.sh | bash
echo ""
echo "Готово. Нажми Enter, чтобы закрыть окно."
read _
