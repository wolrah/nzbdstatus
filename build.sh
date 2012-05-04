#!/bin/bash
7z a -tzip nzbdstatus-`date -u +%Y%M%d%H%M%S`.xpi * -r -mx=9 -xr\!.git -x\!\*.bat -x\!\*.sh -x\!\*.xpi -x\!\*~ -x\!\*.svg
