build-SharedLayer:
	mkdir -p $(ARTIFACTS_DIR)/nodejs
	cp -r *.js $(ARTIFACTS_DIR)/nodejs/
	cp package.json $(ARTIFACTS_DIR)/nodejs/
	cd $(ARTIFACTS_DIR)/nodejs && npm install --production
