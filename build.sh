#!/bin/bash
7z a -tzip nzbdstatus.xpi * -r -mx=9 -xr\!.git -x\!\*.bat -x\!\*.sh -x\!\*.xpi -x\!\*~ -x\!\*.svg
